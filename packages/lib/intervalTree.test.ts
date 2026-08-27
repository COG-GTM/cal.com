import { describe, expect, it } from "vitest";
import { ContainmentSearchAlgorithm, createIntervalNodes, IntervalTree } from "./intervalTree";

type Interval = { start: number; end: number };

const getStart = (i: Interval) => i.start;
const getEnd = (i: Interval) => i.end;

function buildAlgorithm(intervals: Interval[]) {
  const nodes = createIntervalNodes(intervals, getStart, getEnd);
  const tree = new IntervalTree(nodes);
  return { tree, algorithm: new ContainmentSearchAlgorithm(tree) };
}

describe("createIntervalNodes", () => {
  it("maps items to nodes with start, end, index and maxEnd", () => {
    const intervals: Interval[] = [
      { start: 1, end: 5 },
      { start: 3, end: 8 },
    ];
    const nodes = createIntervalNodes(intervals, getStart, getEnd);

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ item: intervals[0], index: 0, start: 1, end: 5, maxEnd: 5 });
    expect(nodes[1]).toMatchObject({ item: intervals[1], index: 1, start: 3, end: 8, maxEnd: 8 });
  });

  it("returns an empty array for no items", () => {
    expect(createIntervalNodes([], getStart, getEnd)).toEqual([]);
  });
});

describe("IntervalTree", () => {
  it("returns undefined root for empty input", () => {
    const tree = new IntervalTree<Interval>([]);
    expect(tree.getRoot()).toBeUndefined();
  });

  it("uses the middle node as root and computes maxEnd from subtrees", () => {
    const intervals: Interval[] = [
      { start: 0, end: 10 },
      { start: 2, end: 4 },
      { start: 5, end: 20 },
    ];
    const nodes = createIntervalNodes(intervals, getStart, getEnd);
    const root = new IntervalTree(nodes).getRoot();

    expect(root?.start).toBe(2);
    expect(root?.maxEnd).toBe(20);
    expect(root?.left?.maxEnd).toBe(10);
    expect(root?.right?.maxEnd).toBe(20);
  });

  it("builds a single-node tree without children", () => {
    const nodes = createIntervalNodes([{ start: 1, end: 2 }], getStart, getEnd);
    const root = new IntervalTree(nodes).getRoot();

    expect(root?.left).toBeUndefined();
    expect(root?.right).toBeUndefined();
    expect(root?.maxEnd).toBe(2);
  });
});

describe("ContainmentSearchAlgorithm", () => {
  it("finds intervals containing the target range", () => {
    // intervals must be sorted by start time, as the tree builder expects
    const intervals: Interval[] = [
      { start: 0, end: 100 },
      { start: 5, end: 50 },
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ];
    const { algorithm } = buildAlgorithm(intervals);

    const result = algorithm.findContainingIntervals(12, 18, 2);
    const containing = result.map((node) => node.index).sort();

    expect(containing).toEqual([0, 1]);
  });

  it("excludes the target's own index", () => {
    const intervals: Interval[] = [
      { start: 0, end: 100 },
      { start: 0, end: 100 },
    ];
    const { algorithm } = buildAlgorithm(intervals);

    const result = algorithm.findContainingIntervals(0, 100, 0);

    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(1);
  });

  it("returns empty when nothing contains the target", () => {
    const intervals: Interval[] = [
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ];
    const { algorithm } = buildAlgorithm(intervals);

    expect(algorithm.findContainingIntervals(0, 20, -1)).toEqual([]);
  });

  it("returns empty for an empty tree", () => {
    const { algorithm } = buildAlgorithm([]);
    expect(algorithm.findContainingIntervals(0, 10, -1)).toEqual([]);
  });

  it("skips invalid intervals (end < start) but still searches their children", () => {
    const intervals: Interval[] = [
      { start: 0, end: 50 },
      { start: 30, end: 10 },
      { start: 0, end: 60 },
    ];
    const { algorithm } = buildAlgorithm(intervals);

    const result = algorithm.findContainingIntervals(5, 9, -1);
    const containing = result.map((node) => node.index).sort();

    expect(containing).toEqual([0, 2]);
  });

  it("prunes left subtree when its maxEnd is before the target start", () => {
    const intervals: Interval[] = [
      { start: 0, end: 5 },
      { start: 10, end: 40 },
      { start: 20, end: 30 },
    ];
    const { algorithm } = buildAlgorithm(intervals);

    const result = algorithm.findContainingIntervals(20, 30, 2);

    expect(result.map((node) => node.index)).toEqual([1]);
  });

  it("prunes right subtree when node start is after the target end", () => {
    const intervals: Interval[] = [
      { start: 0, end: 10 },
      { start: 50, end: 100 },
      { start: 60, end: 70 },
    ];
    const { algorithm } = buildAlgorithm(intervals);

    const result = algorithm.findContainingIntervals(2, 8, -1);

    expect(result.map((node) => node.index)).toEqual([0]);
  });
});
