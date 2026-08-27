import { describe, expect, it } from "vitest";
import { ContainmentSearchAlgorithm, createIntervalNodes, IntervalTree } from "./intervalTree";

type Range = { start: number; end: number };

const buildAlgorithm = (ranges: Range[]): ContainmentSearchAlgorithm<Range> => {
  const nodes = createIntervalNodes(
    ranges,
    (r) => r.start,
    (r) => r.end
  );
  return new ContainmentSearchAlgorithm(new IntervalTree(nodes));
};

describe("createIntervalNodes", () => {
  it("maps items to nodes with start, end, index and maxEnd", () => {
    const items: Range[] = [
      { start: 1, end: 5 },
      { start: 3, end: 8 },
    ];
    const nodes = createIntervalNodes(
      items,
      (i) => i.start,
      (i) => i.end
    );
    expect(nodes).toEqual([
      { item: items[0], index: 0, start: 1, end: 5, maxEnd: 5 },
      { item: items[1], index: 1, start: 3, end: 8, maxEnd: 8 },
    ]);
  });

  it("returns an empty array for no items", () => {
    expect(
      createIntervalNodes(
        [],
        () => 0,
        () => 0
      )
    ).toEqual([]);
  });
});

describe("IntervalTree", () => {
  it("returns undefined root for empty input", () => {
    const tree = new IntervalTree<Range>([]);
    expect(tree.getRoot()).toBeUndefined();
  });

  it("builds a balanced tree with correct maxEnd propagation", () => {
    const ranges: Range[] = [
      { start: 1, end: 10 },
      { start: 2, end: 4 },
      { start: 5, end: 20 },
    ];
    const nodes = createIntervalNodes(
      ranges,
      (r) => r.start,
      (r) => r.end
    );
    const root = new IntervalTree(nodes).getRoot();
    expect(root?.start).toBe(2);
    expect(root?.maxEnd).toBe(20);
    expect(root?.left?.maxEnd).toBe(10);
    expect(root?.right?.maxEnd).toBe(20);
  });
});

describe("ContainmentSearchAlgorithm", () => {
  it("finds intervals that fully contain the target", () => {
    const algorithm = buildAlgorithm([
      { start: 0, end: 100 },
      { start: 10, end: 20 },
      { start: 15, end: 18 },
      { start: 50, end: 60 },
    ]);
    const result = algorithm.findContainingIntervals(15, 18, 2);
    expect(result.map((n) => n.index).sort()).toEqual([0, 1]);
  });

  it("excludes the target interval itself", () => {
    const algorithm = buildAlgorithm([
      { start: 10, end: 20 },
      { start: 10, end: 20 },
    ]);
    const result = algorithm.findContainingIntervals(10, 20, 0);
    expect(result.map((n) => n.index)).toEqual([1]);
  });

  it("returns empty when nothing contains the target", () => {
    const algorithm = buildAlgorithm([
      { start: 0, end: 5 },
      { start: 6, end: 9 },
    ]);
    expect(algorithm.findContainingIntervals(0, 9, -1)).toEqual([]);
  });

  it("returns empty for an empty tree", () => {
    const algorithm = buildAlgorithm([]);
    expect(algorithm.findContainingIntervals(0, 10, -1)).toEqual([]);
  });

  it("skips invalid intervals (end < start) but still searches their children", () => {
    const ranges: Range[] = [
      { start: 0, end: 30 },
      { start: 50, end: 40 }, // invalid, becomes root of the 3-node tree
      { start: 5, end: 25 },
    ];
    const nodes = createIntervalNodes(
      ranges,
      (r) => r.start,
      (r) => r.end
    );
    // Ensure the invalid interval is the root so both branches are traversed
    const tree = new IntervalTree([nodes[0], nodes[1], nodes[2]]);
    expect(tree.getRoot()?.index).toBe(1);
    const algorithm = new ContainmentSearchAlgorithm(tree);
    const result = algorithm.findContainingIntervals(10, 20, -1);
    expect(result.map((n) => n.index).sort()).toEqual([0, 2]);
  });

  it("prunes left subtree when its maxEnd is before the target start", () => {
    const algorithm = buildAlgorithm([
      { start: 0, end: 5 },
      { start: 40, end: 100 },
      { start: 60, end: 70 },
    ]);
    const result = algorithm.findContainingIntervals(60, 70, 2);
    expect(result.map((n) => n.index)).toEqual([1]);
  });
});
