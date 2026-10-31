import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";
import App from "../../src/panel/App.vue";

it("renders the panel shell", () => {
  expect(mount(App).text()).toContain("RC");
});
