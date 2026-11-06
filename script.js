const neutrals = { L: 74, R: 77, A: 81, Y: 83, X: 86 };

const buttonNotes = Object.fromEntries(
	Object.entries(neutrals).map(([btn, n]) => [btn, {
		neutral: n,
		d_up: n + 1,
		d_down: n - 1,
		s_up: n - 2,
		s_down: n + 2,
	}])
);

const pitchNames = [
	"Do5", "Do#5", "Re5", "Re#5", "Mi5", "Fa5", "Fa#5", "Sol5",
	"Sol#5", "La5", "La#5", "Si5", "Do6", "Do#6", "Re6", "Re#6",
];
const alphabetPitchNames = [
	"C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5",
	"G#5", "A5", "A#5", "B5", "C6", "C#6", "D6", "D#6",
];
const pitches = pitchNames.map((name, index) => ({
	name,
	alphabetName: alphabetPitchNames[index],
	midi: 72 + index,
}));

const columnCount = 16;
const highestMidi = 87;
const defaultNotation = "alphabet";
const selectedNotes = Array(columnCount).fill(null);
const staffGrid = document.querySelector("#staff-grid");
const pitchLabels = document.querySelector("#pitch-labels");
const columnLabels = document.querySelector("#column-labels");
const buttonStaff = document.querySelector("#button-staff");
const notationToggle = document.querySelector(".notation-toggle");
const clearButton = document.querySelector("#clear-button");
const copyButton = document.querySelector("#copy-button");
const pasteButton = document.querySelector("#paste-button");
const clipboardStatus = document.querySelector("#clipboard-status");
const staffRows = new Map([
	[72, 18], [73, 17], [74, 16], [75, 15], [76, 14],
	[77, 12], [78, 11], [79, 10], [80, 9], [81, 8],
	[82, 7], [83, 6], [84, 4], [85, 3], [86, 2], [87, 1],
]);
const staffLines = new Set([76, 79, 83, 86]);
const sharpNotes = new Set([1, 3, 6, 8, 10]);
const labelsByMidi = new Map();
const cellsByMidi = new Map();
const faceButtons = new Set(["A", "Y", "X"]);
let clipboardStatusTimer;
let clipboardFadeTimer;
const outputButtonRows = new Map([
	["L", 5], ["R", 4], ["A", 3], ["Y", 2], ["X", 1],
]);
const modifierLabels = {
	neutral: "",
	d_up: "+1",
	d_down: "-1",
	s_up: "-2",
	s_down: "+2",
};
const buttonCandidates = Object.entries(buttonNotes).flatMap(([button, notes]) =>
	Object.entries(notes).map(([modifier, midi]) => ({
		button,
		modifier: modifierLabels[modifier],
		midi,
		complexity: Math.abs(midi - neutrals[button]),
	}))
);

function printSequence() {
	console.log(selectedNotes.filter((note) => note !== null));
}

function preferredButtonRank(button, previousButton) {
	if (previousButton === "R") {
		return faceButtons.has(button) ? 0 : 1;
	}
	if (faceButtons.has(previousButton)) {
		return button === "R" ? 0 : 1;
	}
	if (previousButton === "L") {
		return button === "L" ? 1 : 0;
	}
	return 0;
}

function findButtonForNote(midi, previousButton) {
	let bestCandidate = null;
	let bestRank = Infinity;
	let bestComplexity = Infinity;

	for (const candidate of buttonCandidates) {
		if (candidate.midi !== midi) {
			continue;
		}

		const preferenceRank = preferredButtonRank(candidate.button, previousButton);
		if (
			preferenceRank < bestRank ||
			(preferenceRank === bestRank && candidate.complexity < bestComplexity)
		) {
			bestCandidate = candidate;
			bestRank = preferenceRank;
			bestComplexity = candidate.complexity;
		}
	}

	if (!bestCandidate) {
		throw new Error(`No button mapping exists for MIDI note ${midi}`);
	}
	return bestCandidate;
}

function renderButtonStaff() {
	buttonStaff.replaceChildren();
	let previousButton = null;
	const sequence = [];

	for (const [column, midi] of selectedNotes.entries()) {
		if (midi === null) {
			continue;
		}

		const candidate = findButtonForNote(midi, previousButton);
		previousButton = candidate.button;
		sequence.push(`${candidate.button}${candidate.modifier}`);

		const buttonMarker = document.createElement("span");
		buttonMarker.className = "button-staff-marker";
		buttonMarker.textContent = candidate.button;
		buttonMarker.style.gridColumn = String(column + 1);
		buttonMarker.style.gridRow = String(outputButtonRows.get(candidate.button));

		if (candidate.modifier) {
			const modifier = document.createElement("span");
			modifier.className = "button-staff-modifier";
			modifier.textContent = candidate.modifier;
			modifier.classList.add(candidate.modifier.startsWith("+") ? "modifier-above" : "modifier-below");
			buttonMarker.append(modifier);
		}

		buttonStaff.append(buttonMarker);
	}

	buttonStaff.setAttribute(
		"aria-label",
		sequence.length ? `Button output staff: ${sequence.join(", ")}` : "Button output staff. Empty."
	);
}

function renderSelection() {
	for (const noteCell of staffGrid.querySelectorAll(".note-cell")) {
		const isSelected = selectedNotes[Number(noteCell.dataset.column)] === Number(noteCell.dataset.midi);
		noteCell.classList.toggle("selected", isSelected);
		noteCell.setAttribute("aria-pressed", String(isSelected));
	}
	renderButtonStaff();
}

function setClipboardStatus(message) {
	window.clearTimeout(clipboardStatusTimer);
	window.clearTimeout(clipboardFadeTimer);
	clipboardStatus.classList.remove("fading");
	clipboardStatus.textContent = message;

	if (!message) {
		return;
	}

	clipboardStatusTimer = window.setTimeout(() => {
		clipboardStatus.classList.add("fading");
		clipboardFadeTimer = window.setTimeout(() => {
			clipboardStatus.textContent = "";
			clipboardStatus.classList.remove("fading");
		}, 1000);
	}, 2000);
}

function isValidNoteArray(value) {
	return Array.isArray(value) &&
		value.length === columnCount &&
		value.every((note) => note === null || (
			Number.isInteger(note) &&
			note >= pitches[0].midi &&
			note <= highestMidi
		));
}

for (const pitch of [...pitches].reverse()) {
	const label = document.createElement("span");
	label.className = `pitch-label${pitch.midi === 72 ? " do-label" : ""}`;
	label.textContent = defaultNotation === "alphabet" ? pitch.alphabetName : pitch.name;
	label.style.gridRow = String(staffRows.get(pitch.midi));
	pitchLabels.append(label);
	labelsByMidi.set(pitch.midi, label);
	cellsByMidi.set(pitch.midi, []);

	for (let column = 0; column < columnCount; column += 1) {
		const cell = document.createElement("button");
		cell.type = "button";
		cell.className = "note-cell";
		cell.style.gridRow = String(staffRows.get(pitch.midi));
		cell.style.gridColumn = String(column + 1);
		if (staffLines.has(pitch.midi)) {
			cell.classList.add("staff-line");
		}
		if (pitch.midi === 79) {
			cell.classList.add("sol-line");
		}
		if (sharpNotes.has(pitch.midi % 12)) {
			cell.classList.add("sharp-pitch");
		}
		if (pitch.midi === 72) {
			cell.classList.add("do-line");
		}
		cell.dataset.column = String(column);
		cell.dataset.midi = String(pitch.midi);
		const noteName = defaultNotation === "alphabet" ? pitch.alphabetName : pitch.name;
		cell.setAttribute("aria-label", `Column ${column + 1}, ${noteName}, MIDI ${pitch.midi}`);
		cell.setAttribute("aria-pressed", "false");
		staffGrid.append(cell);
		cellsByMidi.get(pitch.midi).push(cell);
	}
}

notationToggle.addEventListener("click", (event) => {
	const button = event.target.closest("[data-notation]");
	if (!button || !notationToggle.contains(button)) {
		return;
	}

	const useAlphabet = button.dataset.notation === "alphabet";
	for (const option of notationToggle.querySelectorAll(".notation-option")) {
		const isActive = option === button;
		option.classList.toggle("active", isActive);
		option.setAttribute("aria-pressed", String(isActive));
	}

	for (const pitch of pitches) {
		const name = useAlphabet ? pitch.alphabetName : pitch.name;
		labelsByMidi.get(pitch.midi).textContent = name;
		for (const cell of cellsByMidi.get(pitch.midi)) {
			cell.setAttribute("aria-label", `Column ${Number(cell.dataset.column) + 1}, ${name}, MIDI ${pitch.midi}`);
		}
	}
});

for (let column = 1; column <= columnCount; column += 1) {
	const label = document.createElement("span");
	label.textContent = String(column);
	columnLabels.append(label);
}

staffGrid.addEventListener("click", (event) => {
	const cell = event.target.closest(".note-cell");
	if (!cell || !staffGrid.contains(cell)) {
		return;
	}

	const column = Number(cell.dataset.column);
	const midi = Number(cell.dataset.midi);
	if (midi > highestMidi) {
		return;
	}

	selectedNotes[column] = selectedNotes[column] === midi ? null : midi;
	renderSelection();
});

clearButton.addEventListener("click", () => {
	selectedNotes.fill(null);
	renderSelection();
	setClipboardStatus("");
});

copyButton.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(JSON.stringify(selectedNotes));
		setClipboardStatus("Copied 16 note slots as JSON.");
	} catch (error) {
		setClipboardStatus(`Copy failed: ${error.message}`);
	}
});

pasteButton.addEventListener("click", async () => {
	try {
		const clipboardText = await navigator.clipboard.readText();
		let parsed;
		try {
			parsed = JSON.parse(clipboardText);
		} catch {
			setClipboardStatus("Paste failed: clipboard content is not valid JSON.");
			return;
		}

		if (!isValidNoteArray(parsed)) {
			setClipboardStatus(`Paste failed: expected an array of ${columnCount} nulls or MIDI integers from ${pitches[0].midi} to ${highestMidi}.`);
			return;
		}

		selectedNotes.splice(0, columnCount, ...parsed);
		renderSelection();
		setClipboardStatus("Pasted 16 note slots from JSON.");
	} catch (error) {
		setClipboardStatus(`Paste failed: ${error.message}`);
	}
});
