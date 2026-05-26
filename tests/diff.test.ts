import { diffObjects, shouldTrack } from "../src/diff";

describe("Diff Engine", () => {
  describe("shouldTrack", () => {
    it("should allow everything if no include or ignore provided", () => {
      expect(shouldTrack("name", [])).toBe(true);
      expect(shouldTrack("settings.sms", [])).toBe(true);
    });

    it("should reject ignored exact paths and nested paths", () => {
      expect(shouldTrack("password", ["password"])).toBe(false);
      expect(shouldTrack("settings.password", ["settings.password"])).toBe(false);
      expect(shouldTrack("settings.notifications.sms", ["settings.notifications"])).toBe(false);
      expect(shouldTrack("settings", ["settings.notifications"])).toBe(true); // Parent is tracked, only child ignored
    });

    it("should only allow included paths if include is provided", () => {
      const include = ["settings"];
      expect(shouldTrack("settings", [], include)).toBe(true);
      expect(shouldTrack("settings.sms", [], include)).toBe(true);
      expect(shouldTrack("name", [], include)).toBe(false);
    });

    it("should prioritize ignore over include", () => {
      const include = ["settings"];
      const ignore = ["settings.password"];
      expect(shouldTrack("settings.sms", ignore, include)).toBe(true);
      expect(shouldTrack("settings.password", ignore, include)).toBe(false);
    });
  });

  describe("diffObjects", () => {
    it("should detect shallow primitive changes", () => {
      const oldObj = { name: "Jack", age: 20 };
      const newObj = { name: "John", age: 20 };
      const changes = diffObjects(oldObj, newObj);

      expect(changes).toEqual([
        { field: "name", from: "Jack", to: "John" }
      ]);
    });

    it("should detect deep object changes", () => {
      const oldObj = { settings: { sms: false, email: true } };
      const newObj = { settings: { sms: true, email: true } };
      const changes = diffObjects(oldObj, newObj);

      expect(changes).toEqual([
        { field: "settings.sms", from: false, to: true }
      ]);
    });

    it("should handle new fields being added", () => {
      const oldObj = { name: "Jack" };
      const newObj = { name: "Jack", age: 20 };
      const changes = diffObjects(oldObj, newObj);

      expect(changes).toEqual([
        { field: "age", from: undefined, to: 20 }
      ]);
    });

    it("should handle fields being deleted", () => {
      const oldObj = { name: "Jack", age: 20 };
      const newObj = { name: "Jack" };
      const changes = diffObjects(oldObj, newObj);

      expect(changes).toEqual([
        { field: "age", from: 20, to: undefined }
      ]);
    });

    it("should obfuscate fields correctly", () => {
      const oldObj = { password: "old" };
      const newObj = { password: "new" };
      const changes = diffObjects(oldObj, newObj, [], ["password"]);

      expect(changes).toEqual([
        { field: "password", from: "***", to: "***" }
      ]);
    });

    it("should not obfuscate undefined fields", () => {
      const oldObj = { password: "old" };
      const newObj = {};
      const changes = diffObjects(oldObj, newObj, [], ["password"]);

      expect(changes).toEqual([
        { field: "password", from: "***", to: undefined }
      ]);
    });

    it("should ignore fields", () => {
      const oldObj = { name: "Jack", ignored: true };
      const newObj = { name: "John", ignored: false };
      const changes = diffObjects(oldObj, newObj, ["ignored"]);

      expect(changes).toEqual([
        { field: "name", from: "Jack", to: "John" }
      ]);
    });
  });
});
