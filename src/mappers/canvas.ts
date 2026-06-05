import type { ScenePayload } from "../types";
import type { SceneMapper } from "./index";

// Future seam: turn a Role Call scene into an actual Foundry map Scene
// (background image, grid, walls, notes). Role Call scenes don't carry battlemap
// art yet — maps are on the roadmap — so this stub exists only to lock in the
// interface. When art lands, implement `apply` with `Scene.create({...})` and
// register a "canvas"/"both" mode in mappers/index.ts + a module setting.
export class CanvasMapper implements SceneMapper {
  static readonly key = "canvas";
  readonly key = CanvasMapper.key;

  async apply(_scene: ScenePayload, _folder: unknown): Promise<void> {
    void _scene;
    void _folder;
    throw new Error("Map canvas sync isn't available yet — Role Call scenes have no map art.");
  }
}
