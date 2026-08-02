import { describe, expect, it } from "bun:test";
import type { Component } from "@earendil-works/pi-tui";
import { driveComponent } from "../src/drive-component.js";

/** A minimal, fully in-memory fake Component: echoes every handleInput call it receives into its own render output. */
class RecordingComponent implements Component {
	readonly received: string[] = [];
	private invalidated = 0;

	render(_width: number): string[] {
		return [`received: ${JSON.stringify(this.received)}`];
	}
	handleInput(data: string): void {
		this.received.push(data);
	}
	invalidate(): void {
		this.invalidated++;
	}
	get invalidatedCount(): number {
		return this.invalidated;
	}
}

describe("driveComponent", () => {
	it("render() delegates straight to the component's own render()", () => {
		const component = new RecordingComponent();
		const driven = driveComponent(component);
		expect(driven.render(80)).toEqual(["received: []"]);
	});

	it("pressKey() encodes a named key and forwards the real sequence to handleInput()", () => {
		const component = new RecordingComponent();
		const driven = driveComponent(component);
		driven.pressKey("enter");
		expect(component.received).toEqual(["\r"]);
	});

	it("pressKey() with a plain letter forwards the literal character", () => {
		const component = new RecordingComponent();
		const driven = driveComponent(component);
		driven.pressKey("a");
		expect(component.received).toEqual(["a"]);
	});

	it("type() forwards each character of a string as its own handleInput call, in order", () => {
		const component = new RecordingComponent();
		const driven = driveComponent(component);
		driven.type("hi!");
		expect(component.received).toEqual(["h", "i", "!"]);
	});

	it("sendRaw() forwards an arbitrary raw sequence verbatim, for cases encodeKey can't cover", () => {
		const component = new RecordingComponent();
		const driven = driveComponent(component);
		driven.sendRaw("\x1b[1;5A"); // ctrl+up, CSI-with-modifier form
		expect(component.received).toEqual(["\x1b[1;5A"]);
	});

	it("pressKeys() sends a whole sequence of named keys in order", () => {
		const component = new RecordingComponent();
		const driven = driveComponent(component);
		driven.pressKeys(["h", "i", "enter"]);
		expect(component.received).toEqual(["h", "i", "\r"]);
	});

	it("throws a clear error calling pressKey/type on a component with no handleInput", () => {
		const noInputComponent: Component = {
			render: () => ["static"],
			invalidate: () => {},
		};
		const driven = driveComponent(noInputComponent);
		expect(() => driven.pressKey("a")).toThrow(/does not implement handleInput/);
		expect(() => driven.type("x")).toThrow(/does not implement handleInput/);
	});
});
