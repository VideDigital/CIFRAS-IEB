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

export function renderChordMarkup(content) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(renderLyricsWithChords)
    .join("");
}