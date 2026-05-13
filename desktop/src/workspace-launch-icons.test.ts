import { describe, expect, it, vi } from "vitest";
import {
  readWorkspaceLaunchTargetIconDataUrl,
  resolveDarwinAppBundleIconPath,
} from "./workspace-launch-icons.js";

function image(dataUrl: string, empty = false) {
  return {
    isEmpty: () => empty,
    resize: vi.fn(() => ({
      isEmpty: () => empty,
      resize: vi.fn(),
      toDataURL: () => dataUrl,
    })),
    toDataURL: () => dataUrl,
  };
}

describe("resolveDarwinAppBundleIconPath", () => {
  it("resolves extensionless bundle icon names to .icns resources", async () => {
    await expect(resolveDarwinAppBundleIconPath("/Applications/Warp.app", {
      platform: "darwin",
      readPlistRawValue: async () => "AppIcon",
      pathExists: (targetPath) => targetPath === "/Applications/Warp.app/Contents/Resources/AppIcon.icns",
    })).resolves.toBe("/Applications/Warp.app/Contents/Resources/AppIcon.icns");
  });

  it("returns null outside macOS app bundles", async () => {
    await expect(resolveDarwinAppBundleIconPath("/usr/bin/code", {
      platform: "linux",
      readPlistRawValue: async () => "Code",
      pathExists: () => true,
    })).resolves.toBeNull();
  });
});

describe("readWorkspaceLaunchTargetIconDataUrl", () => {
  it("prefers the native file icon before falling back to bundle resources", async () => {
    const getFileIcon = vi.fn(async () => image("data:image/png;base64,file"));
    const createImageFromPath = vi.fn(() => image("data:image/png;base64,bundle"));

    await expect(readWorkspaceLaunchTargetIconDataUrl({
      id: "vscode",
      label: "VS Code",
      kind: "ide",
      iconPath: "/Applications/Visual Studio Code.app",
    }, {
      platform: "darwin",
      getFileIcon,
      createImageFromPath,
    })).resolves.toBe("data:image/png;base64,file");

    expect(getFileIcon).toHaveBeenCalledWith("/Applications/Visual Studio Code.app", { size: "large" });
    expect(createImageFromPath).not.toHaveBeenCalled();
  });

  it("falls back to bundle icons when the native file icon is unavailable", async () => {
    const getFileIcon = vi.fn(async () => image("", true));
    const createImageFromPath = vi.fn(() => image("data:image/png;base64,bundle"));

    await expect(readWorkspaceLaunchTargetIconDataUrl({
      id: "terminal",
      label: "Terminal",
      kind: "terminal",
      iconPath: "/System/Applications/Utilities/Terminal.app",
    }, {
      platform: "darwin",
      getFileIcon,
      createImageFromPath,
      resolveBundleIconPath: async () => "/System/Applications/Utilities/Terminal.app/Contents/Resources/Terminal.icns",
    })).resolves.toBe("data:image/png;base64,bundle");
  });
});
