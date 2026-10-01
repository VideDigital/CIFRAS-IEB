const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

const NOTE_INDEX = {
  C:0,"B#":0,
  "C#":1,Db:1,
  D:2,
  "D#":3,Eb:3,
  E:4,Fb:4,
  "E#":5,F:5,
  "F#":6,Gb:6,
  G:7,
  "G#":8,Ab:8,
  A:9,
  "A#":10,Bb:10,
  B:11,Cb:11
};

export const KEYS = [
  "C","C#","Db","D","D#","Eb","E","F","F#","Gb",
  "G","G#","Ab","A","A#","Bb","B"
];

function rootOf(value = "") {
  return String(value).trim().match(/^([A-G](?:#|b)?)/)?.[1] || "C";
}

export function transposeNote(note, semitones, preferFlats = false) {
  const index = NOTE_INDEX[note];
  if (index === undefined) return note;
  const target = (index + semitones + 120) % 12;
  return (preferFlats ? FLAT : SHARP)[target];
}

export function stepKey(currentKey = "C", delta = 1, preferFlats = null) {
  const root = rootOf(currentKey);
  const index = NOTE_INDEX[root] ?? 0;
  const flatPreference = preferFlats ?? /b/.test(root);
  const scale = flatPreference ? FLAT : SHARP;
  return scale[(index + delta + 120) % 12];
}

export function transposeChord(chord, semitones, preferFlats = false) {
  const source = String(chord || "").trim();
  if (!source || /^N\.?C\.?$/i.test(source)) return source;

  const rootMatch = source.match(/^([A-G](?:#|b)?)/);
  if (!rootMatch) return source;

  let result =
    transposeNote(rootMatch[1], semitones, preferFlats) +
    source.slice(rootMatch[1].length);

  result = result.replace(
    /\/([A-G](?:#|b)?)(?=$)/,
    (_, bass) => `/${transposeNote(bass, semitones, preferFlats)}`
  );

  return result;
}

export function transposeContent(content, semitones, preferFlats = false) {
  return String(content || "").replace(/\[([^\]]+)\]/g, (_, chord) =>
    `[${transposeChord(chord.trim(), semitones, preferFlats)}]`
  );
}

export function semitoneDistance(fromKey, toKey) {
  const from = NOTE_INDEX[rootOf(fromKey)] ?? 0;
  const to = NOTE_INDEX[rootOf(toKey)] ?? 0;
  return (to - from + 12) % 12;
}

function repairRenderedText(value = "") {
  let text = String(value ?? "");

  const replacements = [
    ["Ã¡","á"],["Ã¢","â"],["Ã£","ã"],["Ã©","é"],["Ãª","ê"],
    ["Ã­","í"],["Ã³","ó"],["Ã´","ô"],["Ãµ","õ"],["Ãº","ú"],
    ["Ã§","ç"],["Ã‡","Ç"],["Ãƒ","Ã"],["Ã‰","É"],["Ã“","Ó"],
    ["Ãš","Ú"],["Â",""],["â€“","–"],["â€”","—"],["â†’","→"],["â†","←"]
  ];

  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    for (const [broken, correct] of replacements) {
      text = text.split(broken).join(correct);
    }
    if (before === text) break;
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

function normalizeSectionName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function sectionData(line = "") {
  const repairedLine = repairRenderedText(line).trim();
  const colonMatch = repairedLine.match(/^::\s*(.+?)\s*::$/);
  const bracketMatch = repairedLine.match(/^\[([^\]]+)\]$/);
  const plainMatch = repairedLine.match(
    /^(intro(?:dução|ducao)?|verso(?:\s+\d+)?|pré-refrão|pre-refrao|refrão|refrao|ponte|interlúdio|interludio|solo|pausa|ministração|ministracao|oração|oracao|espontâneo|espontaneo|modulação|modulacao|final|coda)\s*:?\s*$/i
  );

  let label =
    colonMatch?.[1]?.trim() ||
    bracketMatch?.[1]?.trim() ||
    plainMatch?.[1]?.trim() ||
    "";

  if (!label) return null;

  const normalized = normalizeSectionName(label);
  const sectionPatterns = [
    "intro","introducao",
    "primeira-parte","segunda-parte","terceira-parte",
    "verso","verso-1","verso-2","verso-3",
    "pre-refrao","refrao","pos-refrao",
    "ponte","interludio","solo","pausa",
    "ministracao","oracao","espontaneo",
    "modulacao","final","coda","repete"
  ];

  if (
    bracketMatch &&
    !sectionPatterns.some((item) =>
      normalized === item || normalized.startsWith(`${item}-`)
    )
  ) {
    return null;
  }

  const knownTypes = {
    introducao:"intro", intro:"intro",
    verso:"verse","verso-1":"verse","verso-2":"verse","verso-3":"verse",
    "primeira-parte":"verse","segunda-parte":"verse","terceira-parte":"verse",
    "pre-refrao":"prechorus",refrao:"chorus","pos-refrao":"postchorus",
    ponte:"bridge",interludio:"interlude",solo:"solo",pausa:"pause",
    ministracao:"ministry",oracao:"prayer",espontaneo:"spontaneous",
    modulacao:"modulation",final:"ending",coda:"ending",repete:"repeat"
  };

  return {
    label: repairRenderedText(label).toUpperCase(),
    cssType: knownTypes[normalized] || "custom"
  };
}

function renderSectionMarker(line) {
  const data = sectionData(line);
  if (!data) return null;

  return `
    <div class="song-section-marker section-${data.cssType}">
      <span>${escapeHtml(data.label)}</span>
    </div>`;
}

function cleanRawChordToken(token = "") {
  return String(token)
    .trim()
    .replace(/^[|:;,]+|[|:;,]+$/g, "")
    .replace(/[♯]/g, "#")
    .replace(/[♭]/g, "b")
    .replace(/^[([{]+|[)\]},.]+$/g, "");
}

function isRawChordToken(token = "") {
  const clean = cleanRawChordToken(token);
  if (/^N\.?C\.?$/i.test(clean)) return true;
  if (!/^[A-G](?:#|b)?/.test(clean)) return false;

  const suffix = clean.replace(/^[A-G](?:#|b)?/, "");
  if (!suffix) return true;

  return /^(?:m|maj|min|M|dim|aug|sus|add|omit|no|alt|°|º|ø|\d|#|b|\+|-|\(|\)|\/[A-G](?:#|b)?|\/\d)*$/i.test(suffix);
}

function rawChordMatches(line = "") {
  const matches = [];
  const pattern = /\S+/g;
  let match;

  while ((match = pattern.exec(String(line)))) {
    const chord = cleanRawChordToken(match[0]);
    if (isRawChordToken(chord)) {
      matches.push({ chord, index: match.index });
    }
  }

  return matches;
}

function isRawChordLine(line = "") {
  const raw = String(line || "").trim();
  if (!raw || raw.length > 180) return false;

  const sectionPrefix = raw.match(
    /^(?:intro|introdução|introducao|verso|refrão|refrao|ponte|solo|interlúdio|interludio|final)\s*:\s*(.+)$/i
  );
  const body = sectionPrefix ? sectionPrefix[1] : raw;

  const tokens = body.replace(/[|:]/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const allowed = tokens.filter((token) =>
    isRawChordToken(token) ||
    /^\(?\d+x\)?$/i.test(token) ||
    /^(?:bis|repete|volta)$/i.test(token)
  );

  return tokens.some(isRawChordToken) && allowed.length === tokens.length;
}

function mergeRawChordLineWithLyric(chordLine, lyricLine) {
  const matches = rawChordMatches(chordLine);
  if (!matches.length) return lyricLine;

  const sourceWidth = Math.max(1, String(chordLine).length);
  const lyric = String(lyricLine || "").trimEnd();
  const lyricWidth = Math.max(1, lyric.length);

  let merged = lyric;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const item = matches[index];
    const direct = item.index;
    const proportional = Math.round((item.index / sourceWidth) * lyricWidth);
    const position =
      direct <= lyricWidth + 6
        ? Math.max(0, direct)
        : Math.max(0, proportional);

    const safePosition = Math.min(position, merged.length);
    merged =
      merged.slice(0, safePosition) +
      `[${item.chord}]` +
      merged.slice(safePosition);
  }

  return merged;
}

function renderRawChordOnlyLine(line = "") {
  const matches = rawChordMatches(line);

  if (!matches.length) {
    return `<div class="lyrics-only-line">${escapeHtml(line) || "&nbsp;"}</div>`;
  }

  return `<div class="chord-only-line">${
    matches.map(({ chord }) =>
      `<button class="chord chord-only" data-chord="${escapeHtml(chord)}" type="button">${escapeHtml(chord)}</button>`
    ).join('<span class="chord-gap">&nbsp;&nbsp;</span>')
  }</div>`;
}

function parseBracketSegments(line = "") {
  const matches = [...String(line).matchAll(/\[([^\]]+)\]/g)];
  if (!matches.length) return null;

  const segments = [];
  let cursor = 0;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const chordStart = match.index || 0;
    const chordEnd = chordStart + match[0].length;
    const nextChordStart =
      index + 1 < matches.length
        ? (matches[index + 1].index || line.length)
        : line.length;

    if (chordStart > cursor) {
      segments.push({
        chord: "",
        lyric: line.slice(cursor, chordStart),
        plain: true
      });
    }

    segments.push({
      chord: match[1].trim(),
      lyric: line.slice(chordEnd, nextChordStart),
      plain: false
    });

    cursor = nextChordStart;
  }

  if (cursor < line.length) {
    segments.push({
      chord: "",
      lyric: line.slice(cursor),
      plain: true
    });
  }

  return segments;
}

function isBracketChordOnlyLine(line = "") {
  const stripped = String(line)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[|:()xX0-9.,;+\-\s]/g, "");
  return stripped.length === 0 && /\[[^\]]+\]/.test(line);
}

function renderBracketChordOnlyLine(line = "") {
  const segments = parseBracketSegments(line) || [];
  return `<div class="chord-only-line">${
    segments
      .filter((segment) => segment.chord)
      .map((segment) =>
        `<button class="chord chord-only" data-chord="${escapeHtml(segment.chord)}" type="button">${escapeHtml(segment.chord)}</button>`
      )
      .join('<span class="chord-gap">&nbsp;&nbsp;</span>')
  }</div>`;
}

function renderLyricsWithChords(line = "") {
  const segments = parseBracketSegments(line);

  if (!segments) {
    return `<div class="lyrics-only-line">${escapeHtml(line) || "&nbsp;"}</div>`;
  }

  if (isBracketChordOnlyLine(line)) {
    return renderBracketChordOnlyLine(line);
  }

  return `<div class="chord-sheet-line">${
    segments.map((segment) => {
      const lyric = escapeHtml(segment.lyric) || "&nbsp;";

      if (segment.plain) {
        return `
          <span class="chord-lyric-segment plain-segment">
            <span class="chord-spacer">&nbsp;</span>
            <span class="lyric-under-chord">${lyric}</span>
          </span>`;
      }

      const chord = escapeHtml(segment.chord);
      return `
        <span class="chord-lyric-segment">
          <button class="chord" data-chord="${chord}" type="button">${chord}</button>
          <span class="lyric-under-chord">${lyric}</span>
        </span>`;
    }).join("")
  }</div>`;
}

function mergeBracketChordLineWithLyric(chordLine, lyricLine) {
  const matches = [...String(chordLine).matchAll(/\[([^\]]+)\]/g)];
  if (!matches.length) return lyricLine;

  let removedCharacters = 0;
  const placements = matches.map((match) => {
    const visualPosition = Math.max(0, (match.index || 0) - removedCharacters);
    removedCharacters += match[0].length;
    return { chord: match[1].trim(), position: visualPosition };
  });

  let merged = String(lyricLine || "");

  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const placement = placements[index];
    const safePosition = Math.min(placement.position, merged.length);
    merged =
      merged.slice(0, safePosition) +
      `[${placement.chord}]` +
      merged.slice(safePosition);
  }

  return merged;
}

export function renderChordMarkup(content) {
  const lines = repairRenderedText(content || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const rendered = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    const introMatch = trimmed.match(
      /^(intro|introdução|introducao)\s*:\s*(.+)$/i
    );

    if (introMatch && isRawChordLine(introMatch[2])) {
      rendered.push(renderSectionMarker("::INTRODUÇÃO::"));
      rendered.push(renderRawChordOnlyLine(introMatch[2]));
      continue;
    }

    const section = renderSectionMarker(line);
    if (section) {
      rendered.push(section);
      continue;
    }

    const nextLine = lines[index + 1];
    const nextIsSection =
      typeof nextLine === "string" &&
      Boolean(renderSectionMarker(nextLine));

    if (isRawChordLine(line)) {
      if (
        typeof nextLine === "string" &&
        nextLine.trim() &&
        !isRawChordLine(nextLine) &&
        !nextIsSection
      ) {
        rendered.push(
          renderLyricsWithChords(
            mergeRawChordLineWithLyric(line, nextLine)
          )
        );
        index += 1;
      } else {
        rendered.push(renderRawChordOnlyLine(line));
      }
      continue;
    }

    if (
      isBracketChordOnlyLine(line) &&
      typeof nextLine === "string" &&
      nextLine.trim() &&
      !isBracketChordOnlyLine(nextLine) &&
      !isRawChordLine(nextLine) &&
      !nextIsSection
    ) {
      rendered.push(
        renderLyricsWithChords(
          mergeBracketChordLineWithLyric(line, nextLine)
        )
      );
      index += 1;
      continue;
    }

    rendered.push(renderLyricsWithChords(line));
  }

  return rendered.join("");
}
