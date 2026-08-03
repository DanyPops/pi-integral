import { describe, expect, it } from "bun:test";
import { runMultiSelectViewportScenario } from "../src/multi-select-viewport-scenario.js";
import { ViewportToggleListComponent } from "./fixtures/viewport-toggle-list-component.js";

const TOPICS = [
	"Per-item output budgeting",
	"Persisted-graph reliability",
	"TypeScript call-hierarchy failure handling",
	"Symbol and dataflow history",
	"Cross-workspace symbol search",
	"Package-source cache lifecycle",
	"Workspace annotation freshness",
] as const;

describe("runMultiSelectViewportScenario", () => {
	it("captures the exact four-row regression path through real key encoding and VT interpretation", async () => {
		const frames = await runMultiSelectViewportScenario({
			component: new ViewportToggleListComponent(TOPICS),
			width: 100,
		});

		expect(frames.initial.join("\n")).toContain("4. [ ] Symbol and dataflow history");
		expect(frames.initial.join("\n")).not.toContain("5. [ ] Cross-workspace symbol search");
		expect(frames.focusedBeyondViewport.join("\n")).toContain("→ 5. [ ] Cross-workspace symbol search");
		expect(frames.checked.join("\n")).toContain("→ 5. [✓] Cross-workspace symbol search");
		expect(frames.unchecked.join("\n")).toContain("→ 5. [ ] Cross-workspace symbol search");
		expect(frames.returnedToStart.join("\n")).toContain("→ 1. [ ] Per-item output budgeting");
	});
});
