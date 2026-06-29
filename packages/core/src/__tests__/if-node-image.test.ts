import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { generateNodeImage, buildSetImageRefDelta, nodeImageRelPath, type NodeImageDeps } from "../interactive-film/node-image.js";
import { StoryNodeSchema } from "../interactive-film/graph-schema.js";
import { StoryGraphDeltaSchema } from "../interactive-film/delta.js";

const PNG = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]); // PNG magic header (enough for the test)
const stub: NodeImageDeps = { generateImage: async () => ({ buffer: PNG, extension: "png" }) };

describe("generateNodeImage", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "if-img-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("writes the image file and returns an assetRef + node-upsert delta", async () => {
    const node = StoryNodeSchema.parse({ id: "s", type: "start", sceneDesc: "宫门前", choices: [] });
    const { assetRef, delta } = await generateNodeImage({ projectRoot: root, projectId: "p", node, deps: stub });
    expect(assetRef).toBe(nodeImageRelPath("p", "s", "png"));
    const written = await readFile(join(root, assetRef));
    expect(written.equals(PNG)).toBe(true);
    const parsed = StoryGraphDeltaSchema.parse(delta);
    expect(parsed.nodes?.upsert?.[0].imageSlot?.assetRef).toBe(assetRef);
    expect(parsed.nodes?.upsert?.[0].imageSlot?.prompt).toBe("宫门前"); // fell back to sceneDesc
  });

  it("prefers imageSlot.prompt over sceneDesc", async () => {
    const node = StoryNodeSchema.parse({ id: "s", type: "start", sceneDesc: "场景", imageSlot: { prompt: "显式提示词" }, choices: [] });
    const { delta } = await generateNodeImage({ projectRoot: root, projectId: "p", node, deps: stub });
    expect(StoryGraphDeltaSchema.parse(delta).nodes?.upsert?.[0].imageSlot?.prompt).toBe("显式提示词");
  });

  it("throws when there is no prompt or sceneDesc", async () => {
    const node = StoryNodeSchema.parse({ id: "s", type: "start", choices: [] });
    await expect(generateNodeImage({ projectRoot: root, projectId: "p", node, deps: stub })).rejects.toThrow();
  });

  it("rejects a node id containing path-traversal segments that escape projectRoot", async () => {
    // The nodeId is embedded at depth 4: interactive-films/<projectId>/assets/nodes/<nodeId>.png
    // Five leading ".." segments step out of all four prefix dirs plus projectRoot itself.
    const maliciousId = "../../../../../escape";
    const node = StoryNodeSchema.parse({ id: maliciousId, type: "start", sceneDesc: "x", choices: [] });
    await expect(
      generateNodeImage({ projectRoot: root, projectId: "p", node, deps: stub })
    ).rejects.toThrow(/unsafe/i);
    // Verify no file was written outside root (parent of the tmp dir should not
    // contain escape.png — the guard must throw before any write occurs)
    const escapedPath = join(dirname(root), "escape.png");
    await expect(access(escapedPath)).rejects.toThrow();
  });

  it("buildSetImageRefDelta produces a node upsert preserving other fields", () => {
    const node = StoryNodeSchema.parse({ id: "s", type: "branch", title: "T", choices: [{ id: "c", text: "x", targetNodeId: "e" }] });
    const d = buildSetImageRefDelta(node, "p1", "interactive-films/p/assets/nodes/s.png");
    const up = StoryGraphDeltaSchema.parse(d).nodes?.upsert?.[0];
    expect(up?.choices?.[0].targetNodeId).toBe("e"); // preserved
    expect(up?.imageSlot).toEqual({ prompt: "p1", assetRef: "interactive-films/p/assets/nodes/s.png" });
  });
});
