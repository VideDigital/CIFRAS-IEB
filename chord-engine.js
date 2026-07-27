const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const NOTE_INDEX = {C:0,"B#":0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,Fb:4,"E#":5,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11,Cb:11};

export const KEYS = ["C","C#","Db","D","D#","Eb","E","F","F#","Gb","G","G#","Ab","A","A#","Bb","B"];

export function transposeNote(note, semitones, preferFlats=false) {
  const index = NOTE_INDEX[note];
  if (index === undefined) return note;
  const target = (index + semitones + 120) % 12;
  return (preferFlats ? FLAT : SHARP)[target];
}

export function transposeChord(chord, semitones, preferFlats=false) {
  if (!chord || chord === "N.C.") return chord;
  return chord.split("/").map(part => {
    const match = part.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match) return part;
    return transposeNote(match[1], semitones, preferFlats) + match[2];
  }).join("/");
}

export function transposeContent(content, semitones, preferFlats=false) {
  return content.replace(/\[([^\]]+)\]/g, (_, chord) =>
    `[${transposeChord(chord.trim(), semitones, preferFlats)}]`
  );
}

export function semitoneDistance(fromKey, toKey) {
  const from = NOTE_INDEX[fromKey] ?? 0;
  const to = NOTE_INDEX[toKey] ?? 0;
  return (to - from + 12) % 12;
}

function repairRenderedText(value = "") {
  let text = String(value ?? "");

  const replacements = [
    ["\u00C3\u00A1", "\u00E1"], ["\u00C3\u00A2", "\u00E2"], ["\u00C3\u00A3", "\u00E3"], ["\u00C3\u00A9", "\u00E9"],
    ["\u00C3\u00AA", "\u00EA"], ["\u00C3\u00AD", "\u00ED"], ["\u00C3\u00B3", "\u00F3"], ["\u00C3\u00B4", "\u00F4"],
    ["\u00C3\u00B5", "\u00F5"], ["\u00C3\u00BA", "\u00FA"], ["\u00C3\u00A7", "\u00E7"], ["\u00C3\u0087", "\u00C7"],
    ["\u00C3\u0083", "\u00C3"], ["\u00C3\u0089", "\u00C9"], ["\u00C3\u0093", "\u00D3"], ["\u00C3\u009A", "\u00DA"],
    ["\u00C2", ""], ["\u00E2\u0080\u0093", "\u2013"], ["\u00E2\u0080\u0094", "\u2014"],
    ["\u00E2\u0086\u0092", "\u2192"], ["\u00E2\u0086\u0090", "\u2190"]
  ];

  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    replacements.forEach(([broken, correct]) => {
      text = text.split(broken).join(correct);
    });
    if (text === before) break;
  }

  return text.replace(/\uFFFD/g, "");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isChordOnlyLine(line) {
  const withoutChords = line
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[|:()xX0-9.,;+\-\s]/g, "");
  return withoutChords.length === 0;
}

function renderChordOnlyLine(line) {
  const escaped = escapeHtml(line);
  return `<div class="chord-only-line">${
    escaped.replace(/\[([^\]]+)\]/g,
      '<button class="chord chord-only" data-chord="$1" type="button">$1</button>')
  }</div>`;
}

function renderLyricsWithChords(line) {
  const chordPattern = /\[([^\]]+)\]/g;
  const matches = [...line.matchAll(chordPattern)];

  if (!matches.length) {
    return `<div class="lyrics-only-line">${escapeHtml(line) || "&nbsp;"}</div>`;
  }

  if (isChordOnlyLine(line)) {
    return renderChordOnlyLine(line);
  }

  let html = '<div class="chord-sheet-line">';
  let cursor = 0;

  matches.forEach((match, index) => {
    const chordStart = match.index;
    const chordEnd = chordStart + match[0].length;
    const nextChordStart = index + 1 < matches.length
      ? matches[index + 1].index
      : line.length;

    const leadingText = line.slice(cursor, chordStart);
    if (leadingText) {
      html += `<span class="plain-lyric-segment">${escapeHtml(leadingText)}</span>`;
    }

    const lyricText = line.slice(chordEnd, nextChordStart);
    const chord = escapeHtml(match[1].trim());

    html += `
      <span class="chord-lyric-segment">
        <button class="chord" data-chord="${chord}" type="button">${chord}</button>
        <span class="lyric-under-chord">${escapeHtml(lyricText) || "&nbsp;"}</span>
      </span>`;

    cursor = nextChordStart;
  });

  if (cursor < line.length) {
    html += `<span class="plain-lyric-segment">${escapeHtml(line.slice(cursor))}</span>`;
  }

  html += "</div>";
  return html;
}

function normalizeSectionName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function renderSectionMarker(line) {
  const repairedLine = repairRenderedText(line).trim();

  const colonMatch = repairedLine.match(/^::\s*(.+?)\s*::$/);
  const bracketMatch = repairedLine.match(/^\[([^\]]+)\]$/);

  let label = colonMatch?.[1]?.trim() || "";

  if (!label && bracketMatch) {
    const possibleLabel = bracketMatch[1].trim();
    const normalized = normalizeSectionName(possibleLabel);

    const sectionPatterns = [
      "intro", "introducao",
      "primeira-parte", "segunda-parte", "terceira-parte",
      "verso", "verso-1", "verso-2", "verso-3",
      "pre-refrao", "refrao", "pos-refrao",
      "ponte", "interludio", "solo", "pausa",
      "ministracao", "oracao", "espontaneo",
      "modulacao", "final", "coda", "repete"
    ];

    const isSection = sectionPatterns.some((item) =>
      normalized === item || normalized.startsWith(`${item}-`)
    );

    if (isSection) label = possibleLabel;
  }

  if (!label) return null;

  label = repairRenderedText(label);
  const type = normalizeSectionName(label);

  const knownTypes = {
    "introducao": "intro",
    "intro": "intro",
    "verso": "verse",
    "verso-1": "verse",
    "verso-2": "verse",
    "verso-3": "verse",
    "primeira-parte": "verse",
    "segunda-parte": "verse",
    "terceira-parte": "verse",
    "pre-refrao": "prechorus",
    "refrao": "chorus",
    "pos-refrao": "postchorus",
    "ponte": "bridge",
    "interludio": "interlude",
    "solo": "solo",
    "pausa": "pause",
    "ministracao": "ministry",
    "oracao": "prayer",
    "espontaneo": "spontaneous",
    "modulacao": "modulation",
    "final": "ending",
    "coda": "ending",
    "repete": "repeat"
  };

  const cssType = knownTypes[type] || "custom";

  return `
    <div class="song-section-marker section-${cssType}">
      <span>${escapeHtml(label)}</span>
    </div>`;
}

function mergeChordLineWithLyric(chordLine, lyricLine) {
  const matches = [...chordLine.matchAll(/\[([^\]]+)\]/g)];
  if (!matches.length) return lyricLine;

  let merged = lyricLine;
  let removedCharacters = 0;

  const placements = matches.map((match) => {
    const visualPosition = Math.max(
      0,
      (match.index || 0) - removedCharacters
    );
    removedCharacters += match[0].length;
    return {
      chord: match[1].trim(),
      position: visualPosition
    };
  });

  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const placement = placements[index];
    const position = Math.min(placement.position, merged.length);

    if (position >= merged.length) {
      const padding = " ".repeat(Math.max(1, position - merged.length));
      merged += `${padding}[${placement.chord}]`;
    } else {
      merged =
        merged.slice(0, position) +
        `[${placement.chord}]` +
        merged.slice(position);
    }
  }

  return merged;
}

export function renderChordMarkup(content) {
  const lines = repairRenderedText(content || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const rendered = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const section = renderSectionMarker(line);

    if (section) {
      rendered.push(section);
      continue;
    }

    const nextLine = lines[index + 1];
    const nextIsSection =
      typeof nextLine === "string" &&
      Boolean(renderSectionMarker(nextLine));

    if (
      isChordOnlyLine(line) &&
      /\[[^\]]+\]/.test(line) &&
      typeof nextLine === "string" &&
      nextLine.trim() &&
      !isChordOnlyLine(nextLine) &&
      !nextIsSection
    ) {
      rendered.push(
        renderLyricsWithChords(
          mergeChordLineWithLyric(line, nextLine)
        )
      );
      index += 1;
      continue;
    }

    rendered.push(renderLyricsWithChords(line));
  }

  return rendered.join("");
}

