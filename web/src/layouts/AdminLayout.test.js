import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderer, defineComponent, h } from "vue";
import { ElMessage } from "element-plus";
import http from "@/api/http";
import AdminLayout from "./AdminLayout.vue";

AdminLayout.render ||= () => h("div");

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: "/admin/schedules" }),
}));

vi.mock("vue", async (importOriginal) => {
  const vue = await importOriginal();
  return { ...vue, onMounted: vi.fn(), onUnmounted: vi.fn() };
});

vi.mock("@/api/http", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("element-plus", () => ({ ElMessage: { success: vi.fn(), error: vi.fn() } }));

const renderer = createRenderer({
  createElement: (type) => ({ type, props: {}, children: [] }),
  createText: (text) => ({ type: "#text", text }),
  createComment: (text) => ({ type: "#comment", text }),
  setText(node, text) { node.text = text; },
  setElementText(node, text) { node.text = text; node.children = []; },
  patchProp(node, key, _old, value) { node.props[key] = value; },
  insert(node, parent, anchor) {
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(node);
    else parent.children.splice(index, 0, node);
  },
  remove(node) {
    const parent = node.parent;
    if (parent) parent.children.splice(parent.children.indexOf(node), 1);
  },
  parentNode: (node) => node.parent || null,
  nextSibling(node) {
    const siblings = node.parent?.children || [];
    return siblings[siblings.indexOf(node) + 1] || null;
  },
});

const SlotStub = defineComponent({
  setup(_props, { slots }) { return () => h("div", slots.default?.()); },
});

function setupLayout() {
  localStorage.setItem("bj_admin_role", "photographer");
  const app = renderer.createApp(AdminLayout);
  app.provide(Symbol.for("v-scx"), { modules: new Set() });
  for (const name of ["RouterView", "ElDropdown", "ElDropdownMenu", "ElDropdownItem", "ElDialog", "ElForm", "ElFormItem", "ElInput", "ElButton"]) {
    app.component(name, SlotStub);
  }
  const root = { type: "root", children: [] };
  app.mount(root);
  return { state: app._instance.setupState, app };
}

describe("admin account password dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", {
      values: new Map(),
      getItem(key) { return this.values.get(key) || null; },
      setItem(key, value) { this.values.set(key, String(value)); },
      removeItem(key) { this.values.delete(key); },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("opens the same own-password dialog from the shared menu for a photographer", () => {
    const { state, app } = setupLayout();
    expect(state.can("staff")).toBe(false);
    expect(state.can("roster")).toBe(true);

    state.onUserCommand("password");

    expect(state.passwordDialog).toBe(true);
    expect(state.passwordForm).toEqual({ oldPassword: "", newPassword: "", confirmPassword: "" });
    app.unmount();
  });

  it("rejects incomplete, short, reused, and mismatched passwords before the request", async () => {
    const { state, app } = setupLayout();
    const cases = [
      [{ oldPassword: "", newPassword: "longpass", confirmPassword: "longpass" }, /请填写/],
      [{ oldPassword: "oldpass", newPassword: "short", confirmPassword: "short" }, /至少 6 位/],
      [{ oldPassword: "samepass", newPassword: "samepass", confirmPassword: "samepass" }, /不能与原密码相同/],
      [{ oldPassword: "oldpass", newPassword: "newpass1", confirmPassword: "newpass2" }, /不一致/],
    ];

    for (const [form, error] of cases) {
      state.passwordForm = form;
      await state.saveOwnPassword();
      expect(state.passwordError).toMatch(error);
    }
    expect(http.put).not.toHaveBeenCalled();
    app.unmount();
  });

  it("submits once, targets the existing endpoint, and clears the form after success", async () => {
    let finish;
    http.put.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { state, app } = setupLayout();
    state.passwordDialog = true;
    state.passwordForm = { oldPassword: "oldpass", newPassword: "newpass1", confirmPassword: "newpass1" };

    const first = state.saveOwnPassword();
    const second = await state.saveOwnPassword();
    expect(http.put).toHaveBeenCalledTimes(1);
    expect(http.put).toHaveBeenCalledWith("/admin/me/password", { oldPassword: "oldpass", newPassword: "newpass1" });
    expect(state.passwordSubmitting).toBe(true);
    expect(second).toBeUndefined();

    finish({ data: { ok: true } });
    await first;
    expect(state.passwordDialog).toBe(false);
    expect(state.passwordForm).toEqual({ oldPassword: "", newPassword: "", confirmPassword: "" });
    expect(ElMessage.success).toHaveBeenCalledWith("密码已修改，请牢记新密码");
    expect(state.passwordSubmitting).toBe(false);
    app.unmount();
  });

  it("keeps the entered password on API failure and displays the server message", async () => {
    http.put.mockRejectedValue(new Error("原密码不正确"));
    const { state, app } = setupLayout();
    state.passwordDialog = true;
    state.passwordForm = { oldPassword: "wrongpass", newPassword: "newpass1", confirmPassword: "newpass1" };

    await state.saveOwnPassword();

    expect(state.passwordDialog).toBe(true);
    expect(state.passwordError).toBe("原密码不正确");
    expect(state.passwordForm.oldPassword).toBe("wrongpass");
    expect(state.passwordSubmitting).toBe(false);
    app.unmount();
  });
});
