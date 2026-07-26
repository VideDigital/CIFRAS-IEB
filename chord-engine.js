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

export function renderChordMarkup(content) {
  const escaped = content
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return escaped.replace(/\[([^\]]+)\]/g,
    '<button class="chord" data-chord="$1" type="button">$1</button>');
}