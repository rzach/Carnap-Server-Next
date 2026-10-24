/**
 * The lines of a drawn syntax tree, measured from the boxes the browser laid
 * out: one from each split sentence down to each of its children, and from
 * each quantifier to the variables it binds. They are the one drawing the
 * server cannot do, so the element draws them live and over a review alike,
 * reading only the markup both write: `data-state`, `data-bound-by`, and the
 * quantifier's `[data-main]` run.
 *
 * A link never crosses a sentence. The tree leaves two kinds of clear channel
 * — the gutter beside it, and the gap between one row and the next — and a
 * link runs only in them: down from the quantifier into the gap below its
 * row, across to its lane in the gutter, down the lane, and across the gap
 * below each variable it binds, up into the variable's foot. So the links of
 * one quantifier are one bus, branching where a variable joins it, and two
 * quantifiers never share a run: each has its own lane, and its own height
 * within every gap it crosses, which grows when more runs cross it than fit.
 * Where one bus crosses another line it is drawn over a halo of the sheet's
 * colour, the one the sentences are painted in too, so the crossing reads as
 * a crossing. The outermost quantifier takes the outermost lane, so nested
 * scopes nest in the gutter as they do in the sentence.
 *
 * Everything here is hidden from assistive technology, which has the same
 * facts as text: the nesting of the list, and each variable's note.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Room between two lanes in the gutter, and beside the tree. */
const LANE_GAP = 9;

/** The least room between two runs in one gap between rows. */
const RUN_GAP = 6;

/** The radius of the dot where a variable's branch leaves the lane. */
const JOIN_RADIUS = 2.25;

interface Box {
  readonly bottom: number;
  readonly center: number;
  readonly left: number;
  readonly top: number;
}

/** An SVG element made in `owner`, the document the tree is drawn in. */
function svgElement<K extends keyof SVGElementTagNameMap>(
  owner: Document,
  tag: K,
  attributes: Readonly<Record<string, string | number>>,
): SVGElementTagNameMap[K] {
  const element = owner.createElementNS(SVG_NS, tag);

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }

  return element;
}

/**
 * `parent`'s child elements with class `name`. A direct-child walk, not a
 * `:scope >` selector, which jsdom does not resolve inside a shadow root.
 */
function childrenOf(parent: Element | null, name: string): HTMLElement[] {
  return parent === null
    ? []
    : [...parent.children].filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.classList.contains(name),
      );
}

/** How many tree nodes enclose `node`: 0 for the root. */
function depthOf(node: Element, tree: Element): number {
  let depth = 0;

  for (
    let at = node.parentElement?.closest(".st-node");
    at != null && tree.contains(at);
    at = at.parentElement?.closest(".st-node")
  ) {
    depth += 1;
  }

  return depth;
}

export function drawLines(scroll: HTMLElement): void {
  for (const old of scroll.querySelectorAll("svg.st-lines")) {
    old.remove();
  }

  const tree = childrenOf(scroll, "st-tree")[0];

  if (tree === undefined) {
    return;
  }

  const nodes = [...tree.querySelectorAll<HTMLElement>(".st-node")];
  const depths = new Map(nodes.map((node) => [node, depthOf(node, tree)]));
  const bound = nodes.filter((node) => node.dataset.boundBy !== undefined);
  // In preorder, so the outermost quantifier comes first.
  const quantifiers = nodes
    .map((node) => ({
      leaves: bound.filter(
        (leaf) => leaf.dataset.boundBy === node.dataset.path,
      ),
      node,
    }))
    .filter(({ leaves }) => leaves.length > 0);
  // The quantifiers whose links run across the gap under each row, by the
  // row's depth: one from its own row, and one for each row a variable it
  // binds is on. Only they share that gap's height out.
  const runs = new Map<number, number[]>();

  quantifiers.forEach(({ leaves, node }, index) => {
    for (const at of [node, ...leaves]) {
      const depth = depths.get(at) ?? 0;
      const users = runs.get(depth) ?? [];

      if (!users.includes(index)) {
        runs.set(depth, [...users, index]);
      }
    }
  });

  const busiest = Math.max(
    0,
    ...[...runs.values()].map((users) => users.length),
  );

  // Room for the lanes beside the tree, for the gap under its last row, and
  // between rows, enough that no two runs in a gap come closer than RUN_GAP.
  tree.style.paddingInlineStart =
    quantifiers.length === 0
      ? ""
      : `${(quantifiers.length + 1) * LANE_GAP}px`;
  tree.style.paddingBlockEnd =
    busiest === 0 ? "" : `${(busiest + 1) * LANE_GAP}px`;

  for (const gap of tree.querySelectorAll<HTMLElement>(".st-children")) {
    gap.style.paddingTop =
      busiest === 0 ? "" : `max(1.5rem, ${(busiest + 1) * RUN_GAP}px)`;
  }

  // The tree starts at the scroll box's corner, and the two scroll together.
  const origin = tree.getBoundingClientRect();
  const box = (element: Element | null): Box | null => {
    const rect = element?.getBoundingClientRect();

    return rect === undefined
      ? null
      : {
          bottom: rect.bottom - origin.top,
          center: rect.left + rect.width / 2 - origin.left,
          left: rect.left - origin.left,
          top: rect.top - origin.top,
        };
  };
  const sentence = (node: Element) =>
    box(childrenOf(node, "st-sentence")[0] ?? null);
  const svg = svgElement(scroll.ownerDocument, "svg", {
    "aria-hidden": "true",
    class: "st-lines",
    height: tree.scrollHeight,
    width: tree.scrollWidth,
  });

  for (const node of nodes) {
    if (node.dataset.state !== "split") {
      continue;
    }

    const parent = sentence(node);

    for (const child of childrenOf(
      childrenOf(node, "st-children")[0] ?? null,
      "st-node",
    )) {
      const below = sentence(child);

      if (parent !== null && below !== null) {
        svg.append(
          svgElement(scroll.ownerDocument, "line", {
            class: "st-edge",
            x1: parent.center,
            x2: below.center,
            y1: parent.bottom,
            y2: below.top,
          }),
        );
      }
    }
  }

  if (quantifiers.length > 0) {
    drawLinks(svg, nodes, depths, quantifiers, runs, sentence, box);
  }

  scroll.prepend(svg);
}

function drawLinks(
  svg: SVGSVGElement,
  nodes: readonly HTMLElement[],
  depths: ReadonlyMap<Element, number>,
  quantifiers: readonly { leaves: HTMLElement[]; node: HTMLElement }[],
  runs: ReadonlyMap<number, readonly number[]>,
  sentence: (node: Element) => Box | null,
  box: (element: Element | null) => Box | null,
): void {
  // Each row's extent, by depth: the gap below a row runs from its lowest
  // foot to the highest head in the row under it.
  const rows: { top: number; bottom: number }[] = [];
  let left = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const at = sentence(node);
    const depth = depths.get(node) ?? 0;

    if (at === null) {
      continue;
    }

    const row = rows[depth];

    rows[depth] = {
      bottom: Math.max(row?.bottom ?? at.bottom, at.bottom),
      top: Math.min(row?.top ?? at.top, at.top),
    };
    left = Math.min(left, at.left);
  }

  const count = quantifiers.length;
  // Quantifier `index`'s height in the gap under row `depth`: the gap is
  // shared out evenly among the quantifiers that run in it, so no two run at
  // one height, and the outer runs above the inner.
  const runY = (depth: number, index: number) => {
    const users = runs.get(depth) ?? [index];
    const top = rows[depth]?.bottom ?? 0;
    const bottom =
      rows[depth + 1]?.top ?? top + (users.length + 1) * LANE_GAP;

    return (
      top + ((bottom - top) * (users.indexOf(index) + 1)) / (users.length + 1)
    );
  };

  quantifiers.forEach(({ leaves, node: quantifier }, index) => {
    const head = box(
      childrenOf(quantifier, "st-sentence")[0]?.querySelector(
        "[data-main]",
      ) ?? null,
    );
    const depth = depths.get(quantifier);

    if (head === null || depth === undefined) {
      return;
    }

    // The outermost quantifier takes the outermost lane.
    const lane = left - (count - index) * LANE_GAP;
    const start = runY(depth, index);
    const branches = leaves.flatMap((leaf) => {
      const foot = sentence(leaf);
      const leafDepth = depths.get(leaf);

      return foot === null || leafDepth === undefined
        ? []
        : [{ foot, y: runY(leafDepth, index) }];
    });
    const end = Math.max(start, ...branches.map((branch) => branch.y));
    const steps = [
      `M ${head.center} ${head.bottom} V ${start} H ${lane} V ${end}`,
      ...branches.map(
        ({ foot, y }) => `M ${lane} ${y} H ${foot.center} V ${foot.bottom}`,
      ),
    ];

    // Twice: first a wide halo in the sheet's colour, then the line, so a
    // later bus passes over an earlier one, and over the tree's edges, with
    // a gap either side, while the joins within one bus stay whole.
    svg.append(
      svgElement(svg.ownerDocument, "path", {
        class: "st-link-halo",
        d: steps.join(" "),
      }),
      svgElement(svg.ownerDocument, "path", {
        class: "st-link",
        d: steps.join(" "),
      }),
    );

    // A dot wherever a line joins the bus and the bus carries on — a branch
    // leaving the lane above its end, a variable whose branch runs on past
    // it to another in the same gap — so a join is never read as a crossing,
    // nor a crossing as a join.
    const joins = branches.flatMap(({ foot, y }) => [
      ...(y < end ? [{ x: lane, y }] : []),
      ...(branches.some(
        (other) => other.y === y && other.foot.center > foot.center,
      )
        ? [{ x: foot.center, y }]
        : []),
    ]);

    for (const { x, y } of joins) {
      svg.append(
        svgElement(svg.ownerDocument, "circle", {
          class: "st-link-join",
          cx: x,
          cy: y,
          r: JOIN_RADIUS,
        }),
      );
    }
  });
}
