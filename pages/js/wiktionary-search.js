/* DICTIONARY JS - APPROVED WIKTIONARY UI + LOGIC - 2026-08-28 */

import { supabase } from "../../js/supabase.js";


/* =========================================================
   ELEMENTS
   ========================================================= */

const form =
  document.getElementById("wiktionarySearchForm");

const input =
  document.getElementById("wiktionarySearchInput");

const searchButton =
  document.getElementById("wiktionarySearchButton");

const backButton =
  document.getElementById("backButton");

const saveButton =
  document.getElementById("saveButton");

const statusBox =
  document.getElementById("wikiStatus");

const resultsHeader =
  document.getElementById("wikiResultsHeader");

const wordTitle =
  document.getElementById("wikiWordTitle");

const entryCount =
  document.getElementById("wikiEntryCount");

const entriesContainer =
  document.getElementById("wikiEntries");


/* =========================================================
   STATE
   ========================================================= */

let currentWord = "";
let parsedWords = [];
let existingWords = [];


const POS_NAMES = new Set([
  "Noun",
  "Proper noun",
  "Verb",
  "Adjective",
  "Adverb",
  "Pronoun",
  "Numeral",
  "Postposition",
  "Conjunction",
  "Interjection",
  "Determiner",
  "Particle"
]);


const INVARIABLE_POS_NAMES = new Set([
  "Adverb",
  "Numeral",
  "Postposition",
  "Conjunction",
  "Interjection",
  "Determiner",
  "Particle"
]);


/* =========================================================
   AUTH
   ========================================================= */

async function requireSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();


  if (
    error ||
    !data.session
  ) {

    window.location.href =
      "../index.html";

  }

}


/* =========================================================
   NAVIGATION
   ========================================================= */

backButton.addEventListener(
  "click",
  () => {

    window.location.href =
      "./dictionary.html";

  }
);


/* =========================================================
   SEARCH
   ========================================================= */

form.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const word =
      normalizeSearchWord(
        input.value
      );


    if (!word) {

      showStatus(
        "Type a word to search.",
        "error"
      );

      return;

    }


    input.value =
      word;


    await searchWiktionary(
      word
    );

  }
);


function normalizeSearchWord(value) {

  return String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");

}


/* =========================================================
   FETCH
   ========================================================= */

async function searchWiktionary(word) {

  setLoading(true);

  clearResults();


  try {

    const url =
      `https://en.wiktionary.org/w/rest.php/v1/page/${encodeURIComponent(word)}/with_html`;


    const response =
      await fetch(
        url,
        {
          headers: {
            Accept: "application/json"
          }
        }
      );


    if (
      response.status === 404
    ) {

      showStatus(
        `No entry found for “${word}”.`,
        "empty"
      );

      return;

    }


    if (!response.ok) {

      throw new Error(
        `Wiktionary returned HTTP ${response.status}.`
      );

    }


    const data =
      await response.json();


    if (
      !data ||
      typeof data.html !== "string" ||
      !data.html.trim()
    ) {

      throw new Error(
        "Wiktionary returned no HTML."
      );

    }


    currentWord =
      word;


    parsedWords =
      parseTurkishWords(
        data.html,
        word
      );


    console.log(
      "Parsed Turkish words:",
      parsedWords
    );


    if (
      !parsedWords.length
    ) {

      showStatus(
        `No Turkish entry found for “${word}”.`,
        "empty"
      );

      return;

    }


    existingWords =
      await loadExistingWords(
        word
      );


    renderWords();

  } catch (error) {

    console.error(
      "Wiktionary search error:",
      error
    );


    showStatus(
      "Could not load Wiktionary right now.",
      "error"
    );

  } finally {

    setLoading(false);

  }

}


/* =========================================================
   DATABASE CHECK

   ONE turkish_words ROW =
   WORD + ETYMOLOGY
   ========================================================= */

async function loadExistingWords(word) {

  const normalizedWord =
    normalizeSearchWord(
      word
    );


  const {
    data,
    error
  } = await supabase
    .from("turkish_words")
    .select(`
      id,
      word,
      etymology
    `)
    .eq(
      "word",
      normalizedWord
    );


  if (error) {

    console.error(
      "Could not check saved words:",
      error
    );

    return [];

  }


  return data || [];

}


/* =========================================================
   MAIN PARSER
   ========================================================= */

function parseTurkishWords(
  html,
  searchedWord
) {

  const parser =
    new DOMParser();


  const doc =
    parser.parseFromString(
      html,
      "text/html"
    );


  const turkishHeading =
    Array
      .from(
        doc.querySelectorAll("h2")
      )
      .find(
        (heading) =>
          cleanText(
            heading.textContent
          ) === "Turkish"
      );


  if (!turkishHeading) {

    return [];

  }


  const turkishSection =
    turkishHeading.closest(
      "section"
    );


  if (!turkishSection) {

    return [];

  }


  const groups =
    buildEtymologyGroups(
      turkishSection
    );


  const results = [];


  for (
    const group
    of groups
  ) {

    const parsed =
      parseEtymologyGroup(
        group,
        searchedWord
      );


    if (parsed) {

      results.push(
        parsed
      );

    }

  }


  return results;

}


/* =========================================================
   ETYMOLOGY GROUPS
   ========================================================= */

function buildEtymologyGroups(
  turkishSection
) {

  const directSections =
    Array
      .from(
        turkishSection.children
      )
      .filter(
        (child) =>
          child.tagName ===
          "SECTION"
      );


  const numberedIndexes = [];


  directSections.forEach(
    (
      section,
      index
    ) => {

      const title =
        getSectionTitle(
          section
        );


      if (
        /^Etymology\s+\d+$/i.test(
          title
        )
      ) {

        numberedIndexes.push(
          index
        );

      }

    }
  );


  if (
    numberedIndexes.length
  ) {

    const firstEtymologyIndex =
      numberedIndexes[0];


    const sharedPronunciationSections =
      directSections
        .slice(
          0,
          firstEtymologyIndex
        )
        .filter(
          (section) =>
            getSectionTitle(
              section
            ) === "Pronunciation"
        );


    const sharedAlternativeFormSections =
      directSections
        .slice(
          0,
          firstEtymologyIndex
        )
        .filter(
          (section) =>
            getSectionTitle(
              section
            ) === "Alternative forms"
        );


    const groups = [];


    numberedIndexes.forEach(
      (
        startIndex,
        position
      ) => {

        const endIndex =
          position + 1 <
          numberedIndexes.length
            ? numberedIndexes[
                position + 1
              ]
            : directSections.length;


        const sections =
          directSections.slice(
            startIndex,
            endIndex
          );


        const etymologySection =
          sections[0];


        const title =
          getSectionTitle(
            etymologySection
          );


        const match =
          title.match(
            /^Etymology\s+(\d+)$/i
          );


        groups.push({

          etymology:
            match
              ? Number(
                  match[1]
                )
              : position + 1,

          etymologySection,

          sections,

          sharedPronunciationSections,

          sharedAlternativeFormSections

        });

      }
    );


    return groups;

  }


  const etymologySection =
    directSections.find(
      (section) =>
        getSectionTitle(
          section
        ) === "Etymology"
    ) || null;


  return [
    {

      etymology:
        1,

      etymologySection,

      sections:
        directSections,

      sharedPronunciationSections:
        [],

      sharedAlternativeFormSections:
        []

    }
  ];

}


/* =========================================================
   PARSE ONE ETYMOLOGY
   ========================================================= */

function parseEtymologyGroup(
  group,
  searchedWord
) {

  const posSections =
    findPosSectionsInGroup(
      group
    );


  const partsOfSpeech = [];


  for (
    const posSection
    of posSections
  ) {

    const partOfSpeech =
      getSectionTitle(
        posSection
      );


    const parsedPos =
      parsePartOfSpeech(
        posSection,
        partOfSpeech,
        searchedWord,
        group
      );


    if (parsedPos) {

      partsOfSpeech.push(
        parsedPos
      );

    }

  }


  if (
    !partsOfSpeech.length
  ) {

    return null;

  }


  return {

    word:
      searchedWord,

    etymology:
      group.etymology,

    alternativeForms:
      extractAlternativeFormsForEtymology(
        group
      ),

    etymologyText:
      getCachedEtymologyText(
        searchedWord,
        group.etymology,
        extractEtymologyText(
          group.etymologySection
        )
      ),

    etymologySelected:
      true,

    baseWordText:
      "",

    baseWordId:
      null,

    baseWordSelected:
      false,

    pronunciation:
      extractPronunciationsForEtymology(
        group
      ),

    partsOfSpeech,

    selected:
      true

  };

}


/* =========================================================
   FIND POS
   ========================================================= */

function findPosSectionsInGroup(
  group
) {

  const result = [];

  const seen =
    new Set();


  for (
    const section
    of group.sections
  ) {

    const title =
      getSectionTitle(
        section
      );


    if (
      POS_NAMES.has(
        title
      )
    ) {

      seen.add(
        section
      );

      result.push(
        section
      );

    }


    const descendants =
      section.querySelectorAll(
        "section"
      );


    for (
      const descendant
      of descendants
    ) {

      const descendantTitle =
        getSectionTitle(
          descendant
        );


      if (
        POS_NAMES.has(
          descendantTitle
        ) &&
        !seen.has(
          descendant
        )
      ) {

        seen.add(
          descendant
        );

        result.push(
          descendant
        );

      }

    }

  }


  return result;

}


/* =========================================================
   PARSE POS
   ========================================================= */

function parsePartOfSpeech(
  posSection,
  partOfSpeech,
  searchedWord,
  group
) {

  const headwordLine =
    posSection.querySelector(
      ".headword-line"
    );


  let forms = [];


  if (
    partOfSpeech === "Noun" ||
    partOfSpeech === "Proper noun"
  ) {

    forms =
      parseNounForms(
        posSection,
        headwordLine,
        searchedWord
      );

  }


  if (
    partOfSpeech === "Adjective"
  ) {

    forms =
      parseAdjectiveForms(
        posSection
      );

  }


  if (
    partOfSpeech === "Verb"
  ) {

    forms =
      parseVerbForms(
        posSection,
        headwordLine,
        searchedWord,
        group
      );

  }


  if (
    INVARIABLE_POS_NAMES.has(
      partOfSpeech
    )
  ) {

    /*
      These POS are treated as invariable in this importer.
      Do not generate or infer forms for them.
    */

    forms = [];

  }


  const meanings =
    extractMeanings(
      posSection
    );


  const notes =
    extractPosNotes(
      posSection
    );


  return {

    partOfSpeech,

    forms,

    meanings,

    notes

  };

}


/* =========================================================
   SECTION TITLE
   ========================================================= */

function getSectionTitle(
  section
) {

  if (!section) {

    return "";

  }


  for (
    const child
    of section.children
  ) {

    if (
      /^H[1-6]$/.test(
        child.tagName
      )
    ) {

      return cleanText(
        child.textContent
      );

    }

  }


  return "";

}


/* =========================================================
   ALTERNATIVE FORMS PER ETYMOLOGY

   Alternative forms belong to the WORD + ETYMOLOGY,
   never to a specific part of speech.

   If Wiktionary places Alternative forms before numbered
   etymologies, use them as a shared fallback.
   ========================================================= */

function extractAlternativeFormsForEtymology(
  group
) {

  let alternativeFormSections =
    findAlternativeFormSections(
      group.sections
    );


  if (
    !alternativeFormSections.length &&
    group
      .sharedAlternativeFormSections
      .length
  ) {

    alternativeFormSections =
      group
        .sharedAlternativeFormSections;

  }


  return extractAlternativeFormsFromSections(
    alternativeFormSections
  );

}


function findAlternativeFormSections(
  sections
) {

  const result = [];

  const seen =
    new Set();


  for (
    const section
    of sections
  ) {

    if (
      getSectionTitle(
        section
      ) === "Alternative forms"
    ) {

      if (
        !seen.has(
          section
        )
      ) {

        seen.add(
          section
        );

        result.push(
          section
        );

      }

    }


    const nested =
      section.querySelectorAll(
        "section"
      );


    for (
      const child
      of nested
    ) {

      if (
        getSectionTitle(
          child
        ) !== "Alternative forms"
      ) {

        continue;

      }


      if (
        seen.has(
          child
        )
      ) {

        continue;

      }


      seen.add(
        child
      );

      result.push(
        child
      );

    }

  }


  return result;

}


function extractAlternativeFormsFromSections(
  sections
) {

  const results = [];

  const seen =
    new Set();


  for (
    const section
    of sections
  ) {

    const items =
      Array.from(
        section.querySelectorAll(
          "li"
        )
      );


    for (
      const item
      of items
    ) {

      let valueElements =
        Array.from(
          item.querySelectorAll(
            '[lang="tr"]'
          )
        );


      if (
        !valueElements.length
      ) {

        valueElements =
          Array.from(
            item.querySelectorAll(
              'a[href*="/wiki/"]'
            )
          )
          .filter(
            (element) => {

              const value =
                cleanText(
                  element.textContent
                );


              return (
                value &&
                !/^(edit|citation|citations)$/i.test(
                  value
                )
              );

            }
          );

      }


      for (
        const valueElement
        of valueElements
      ) {

        const value =
          cleanText(
            valueElement.textContent
          );


        if (!value) {

          continue;

        }


        const usageLabel =
          extractAlternativeFormUsageLabel(
            item,
            valueElement
          );


        const normalized =
          normalizeFormValue(
            value
          );


        const dedupeKey =
          `${normalized}|${String(usageLabel || "").toLowerCase()}`;


        if (
          !normalized ||
          seen.has(
            dedupeKey
          )
        ) {

          continue;

        }


        seen.add(
          dedupeKey
        );


        results.push({

          value,

          usageLabel,

          source:
            "wiktionary_alternative_forms",

          selected:
            true

        });

      }

    }

  }


  return results;

}


function extractAlternativeFormUsageLabel(
  item,
  valueElement
) {

  const clone =
    item.cloneNode(
      true
    );


  clone
    .querySelectorAll(
      "sup, style, .mw-ref"
    )
    .forEach(
      (element) =>
        element.remove()
    );


  const valueText =
    cleanText(
      valueElement.textContent
    );


  const candidateElements =
    Array.from(
      clone.querySelectorAll(
        '[lang="tr"], a[href*="/wiki/"]'
      )
    );


  let removedValue =
    false;


  for (
    const element
    of candidateElements
  ) {

    if (
      !removedValue &&
      cleanText(
        element.textContent
      ) === valueText
    ) {

      element.remove();

      removedValue =
        true;

      break;

    }

  }


  let label =
    cleanText(
      clone.textContent
    )
      .replace(
        /^[,;:\-–—\s]+/,
        ""
      )
      .replace(
        /[,;:\-–—\s]+$/,
        ""
      )
      .trim();


  if (
    label.startsWith("(") &&
    label.endsWith(")")
  ) {

    label =
      label
        .slice(
          1,
          -1
        )
        .trim();

  }


  return label || null;

}


/* =========================================================
   ETYMOLOGY TEXT

   Pull the text that belongs directly to the Wiktionary
   Etymology section.

   The user may edit this text later. The original Wiktionary
   text is only the starting value.

   Nested POS / Pronunciation / Declension sections are not
   included here.
   ========================================================= */

function extractEtymologyText(
  etymologySection
) {

  if (!etymologySection) {

    return "";

  }


  const parts = [];


  for (
    const child
    of etymologySection.children
  ) {

    if (
      /^H[1-6]$/.test(
        child.tagName
      )
    ) {

      continue;

    }


    if (
      child.tagName === "SECTION" ||
      child.tagName === "STYLE" ||
      child.tagName === "TABLE" ||
      child.tagName === "FIGURE"
    ) {

      continue;

    }


    const clone =
      child.cloneNode(
        true
      );


    clone
      .querySelectorAll(
        "sup, style, .mw-ref, section, table, figure"
      )
      .forEach(
        (element) =>
          element.remove()
      );


    const text =
      cleanText(
        clone.textContent
      );


    if (!text) {

      continue;

    }


    parts.push(
      text
    );

  }


  return parts
    .join(" ")
    .trim();

}


/* =========================================================
   ETYMOLOGY LOCAL DRAFT CACHE

   Drafts are kept locally on the device/browser so editing
   is independent from the Etymology checkbox.
   ========================================================= */

function getEtymologyCacheKey(
  word,
  etymology
) {

  return [
    "dictionary",
    "turkish",
    "wiktionary",
    "etymology",
    normalizeSearchWord(
      word
    ),
    String(
      etymology
    )
  ].join(":");

}


function getCachedEtymologyText(
  word,
  etymology,
  fallbackText
) {

  try {

    const cached =
      localStorage.getItem(
        getEtymologyCacheKey(
          word,
          etymology
        )
      );


    if (
      cached !== null
    ) {

      return cached;

    }

  } catch (error) {

    console.warn(
      "Could not read etymology draft cache:",
      error
    );

  }


  return fallbackText || "";

}


function cacheEtymologyText(
  wordEntry
) {

  try {

    localStorage.setItem(
      getEtymologyCacheKey(
        wordEntry.word,
        wordEntry.etymology
      ),
      wordEntry.etymologyText || ""
    );

  } catch (error) {

    console.warn(
      "Could not save etymology draft cache:",
      error
    );

  }

}


/* =========================================================
   PRONUNCIATION PER ETYMOLOGY
   ========================================================= */

function extractPronunciationsForEtymology(
  group
) {

  let pronunciationSections =
    findPronunciationSections(
      group.sections
    );


  if (
    !pronunciationSections.length &&
    group
      .sharedPronunciationSections
      .length
  ) {

    pronunciationSections =
      group
        .sharedPronunciationSections;

  }


  return extractPronunciationsFromSections(
    pronunciationSections
  );

}


function findPronunciationSections(
  sections
) {

  const result = [];

  const seen =
    new Set();


  for (
    const section
    of sections
  ) {

    if (
      getSectionTitle(
        section
      ) === "Pronunciation"
    ) {

      if (
        !seen.has(
          section
        )
      ) {

        seen.add(
          section
        );

        result.push(
          section
        );

      }

    }


    const nested =
      section.querySelectorAll(
        "section"
      );


    for (
      const child
      of nested
    ) {

      if (
        getSectionTitle(
          child
        ) !== "Pronunciation"
      ) {

        continue;

      }


      if (
        seen.has(
          child
        )
      ) {

        continue;

      }


      seen.add(
        child
      );

      result.push(
        child
      );

    }

  }


  return result;

}


function extractPronunciationsFromSections(
  sections
) {

  const results = [];

  const seen =
    new Set();


  for (
    const section
    of sections
  ) {

    const ipaElements =
      section.querySelectorAll(
        ".IPA"
      );


    for (
      const element
      of ipaElements
    ) {

      const ipa =
        cleanText(
          element.textContent
        );


      if (!ipa) {

        continue;

      }


      if (
        !ipa.startsWith("/") &&
        !ipa.startsWith("[")
      ) {

        continue;

      }


      if (
        seen.has(
          ipa
        )
      ) {

        continue;

      }


      seen.add(
        ipa
      );


      results.push({

        ipa,

        label:
          extractPronunciationQualifier(
            element
          ),

        selected:
          true

      });

    }

  }


  return results;

}


function extractPronunciationQualifier(
  ipaElement
) {

  const parent =
    ipaElement.closest(
      "li"
    );


  if (!parent) {

    return null;

  }


  const qualifier =
    parent.querySelector(
      ".usage-label-accent, .qualifier-content"
    );


  if (!qualifier) {

    return null;

  }


  return (
    cleanText(
      qualifier.textContent
    ) || null
  );

}


/* =========================================================
   NOUN FORMS
   ========================================================= */

function parseNounForms(
  posSection,
  headwordLine,
  searchedWord
) {

  const forms =
    extractHeadwordForms(
      headwordLine,
      searchedWord
    );


  const hasAccusative =
    forms.some(
      (form) =>
        form.key ===
        "accusative"
    );


  const hasPlural =
    forms.some(
      (form) =>
        form.key ===
        "plural"
    );


  if (
    hasAccusative &&
    hasPlural
  ) {

    return forms;

  }


  const declensionForms =
    extractMissingFormsFromDeclension(
      posSection,
      {
        needAccusative:
          !hasAccusative,

        needPlural:
          !hasPlural
      }
    );


  for (
    const form
    of declensionForms
  ) {

    addFormIfMissing(
      forms,
      form
    );

  }


  return forms;

}


/* =========================================================
   ADJECTIVE FORMS

   Wiktionary only. Never generate or infer a Turkish form.

   Declension
   -> Predicative forms
   -> present tense
   -> positive declarative
   -> ben (I am)
   ========================================================= */

function parseAdjectiveForms(
  posSection
) {

  const declensionSections =
    findDeclensionSections(
      posSection
    );


  for (
    const section
    of declensionSections
  ) {

    const tables =
      Array.from(
        section.querySelectorAll(
          "table"
        )
      );


    for (
      const table
      of tables
    ) {

      const value =
        extractAdjectivePredicativeFromTable(
          table
        );


      if (!value) {

        continue;

      }


      return [
        {

          key:
            "predicative",

          label:
            "Predicative",

          value,

          source:
            "wiktionary_declension",

          selected:
            true

        }
      ];

    }

  }


  return [];

}


function extractAdjectivePredicativeFromTable(
  table
) {

  const tableText =
    cleanTableText(
      table.textContent
    );


  if (
    !/\bPredicative\s+forms\s+of\b/i.test(
      tableText
    )
  ) {

    return null;

  }


  const grid =
    buildTableGrid(
      table
    );


  if (
    !grid.length
  ) {

    return null;

  }


  const presentRow =
    findDeclensionRow(
      grid,
      [
        /^present\s+tense$/i
      ]
    );


  if (
    presentRow === null
  ) {

    return null;

  }


  const declarativeCell =
    findTableCellPosition(
      grid,
      /^positive\s+declarative$/i,
      presentRow + 1
    );


  if (!declarativeCell) {

    return null;

  }


  const benRow =
    findDeclensionRow(
      grid,
      [
        /^ben(?:\s|\()/i
      ],
      declarativeCell.row + 1
    );


  if (
    benRow === null
  ) {

    return null;

  }


  return extractDeclensionCellValue(
    grid[benRow]?.[
      declarativeCell.column
    ]
  );

}


function findTableCellPosition(
  grid,
  pattern,
  startRow = 0
) {

  for (
    let rowIndex = startRow;
    rowIndex < grid.length;
    rowIndex += 1
  ) {

    const row =
      grid[rowIndex];


    if (!row) {

      continue;

    }


    for (
      let columnIndex = 0;
      columnIndex < row.length;
      columnIndex += 1
    ) {

      const cell =
        row[columnIndex];


      if (!cell) {

        continue;

      }


      const cellText =
        normalizeTableLabel(
          cell.text
        );


      if (
        pattern.test(
          cellText
        )
      ) {

        return {
          row:
            rowIndex,

          column:
            columnIndex
        };

      }

    }

  }


  return null;

}


/* =========================================================
   VERB FORMS

   Wiktionary only. Never generate or infer a Turkish form.

   Aorist:
   1. Prefer the form explicitly shown in the headword line:
      third-person singular simple present
   2. If absent, use positive conjugation -> aorist ->
      3rd person singular (o)

   Continuous:
   positive conjugation -> continuous ->
   3rd person singular (o)
   ========================================================= */

function parseVerbForms(
  posSection,
  headwordLine,
  searchedWord,
  group
) {

  const forms = [];


  const headwordAorist =
    extractVerbAoristFromHeadword(
      headwordLine,
      searchedWord
    );


  if (headwordAorist) {

    addFormIfMissing(
      forms,
      {

        key:
          "aorist",

        label:
          "Aorist",

        value:
          headwordAorist,

        source:
          "wiktionary_headword",

        selected:
          true

      }
    );

  }


  const needAorist =
    !forms.some(
      (form) =>
        form.key ===
        "aorist"
    );


  const conjugationForms =
    extractVerbFormsFromConjugation(
      posSection,
      group,
      {
        needAorist
      }
    );


  for (
    const form
    of conjugationForms
  ) {

    addFormIfMissing(
      forms,
      form
    );

  }


  return forms;

}


function extractVerbAoristFromHeadword(
  headwordLine,
  searchedWord
) {

  const headwordForms =
    extractHeadwordForms(
      headwordLine,
      searchedWord
    );


  const aorist =
    headwordForms.find(
      (form) => {

        const label =
          normalizeTableLabel(
            form.label
          );


        return (
          label ===
            "third-person singular simple present" ||
          label ===
            "third person singular simple present" ||
          label ===
            "third-person singular aorist" ||
          label ===
            "third person singular aorist"
        );

      }
    );


  return aorist
    ? aorist.value
    : null;

}


function extractVerbFormsFromConjugation(
  posSection,
  group,
  {
    needAorist
  }
) {

  const forms = [];


  const conjugationSections =
    findConjugationSections(
      posSection,
      group
    );


  for (
    const section
    of conjugationSections
  ) {

    const tables =
      Array.from(
        section.querySelectorAll(
          "table"
        )
      );


    for (
      const table
      of tables
    ) {

      const extracted =
        extractVerbCoreFormsFromConjugationTable(
          table,
          {
            needAorist:
              needAorist &&
              !forms.some(
                (form) =>
                  form.key ===
                  "aorist"
              ),

            needContinuous:
              !forms.some(
                (form) =>
                  form.key ===
                  "continuous"
              )
          }
        );


      for (
        const form
        of extracted
      ) {

        addFormIfMissing(
          forms,
          form
        );

      }


      const gotAorist =
        !needAorist ||
        forms.some(
          (form) =>
            form.key ===
            "aorist"
        );


      const gotContinuous =
        forms.some(
          (form) =>
            form.key ===
            "continuous"
        );


      if (
        gotAorist &&
        gotContinuous
      ) {

        return forms;

      }

    }

  }


  return forms;

}


function findConjugationSections(
  posSection,
  group
) {

  const result = [];

  const seen =
    new Set();


  const addSection =
    (section) => {

      if (
        !section ||
        seen.has(
          section
        )
      ) {

        return;

      }


      seen.add(
        section
      );

      result.push(
        section
      );

    };


  if (
    getSectionTitle(
      posSection
    ) === "Conjugation"
  ) {

    addSection(
      posSection
    );

  }


  for (
    const section
    of posSection.querySelectorAll(
      "section"
    )
  ) {

    if (
      getSectionTitle(
        section
      ) === "Conjugation"
    ) {

      addSection(
        section
      );

    }

  }


  /*
    Parsoid may expose Verb and Conjugation as sibling
    sections instead of nesting Conjugation inside Verb.

    In that case, scan the current etymology group from
    this Verb until the next part of speech.
  */

  if (
    group &&
    Array.isArray(
      group.sections
    )
  ) {

    const posIndex =
      group.sections.indexOf(
        posSection
      );


    if (
      posIndex !== -1
    ) {

      for (
        let index = posIndex + 1;
        index < group.sections.length;
        index += 1
      ) {

        const section =
          group.sections[index];


        const title =
          getSectionTitle(
            section
          );


        if (
          POS_NAMES.has(
            title
          )
        ) {

          break;

        }


        if (
          title === "Conjugation"
        ) {

          addSection(
            section
          );

        }

      }

    }

  }


  return result;

}


function extractVerbCoreFormsFromConjugationTable(
  table,
  {
    needAorist,
    needContinuous
  }
) {

  const results = [];


  if (
    !needAorist &&
    !needContinuous
  ) {

    return results;

  }


  const grid =
    buildTableGrid(
      table
    );


  if (
    !grid.length
  ) {

    return results;

  }


  const positiveRange =
    findConjugationBlockRange(
      grid,
      "positive conjugation"
    );


  if (!positiveRange) {

    return results;

  }


  const thirdPersonColumn =
    findThirdPersonSingularColumn(
      grid,
      positiveRange.start,
      positiveRange.end
    );


  if (
    thirdPersonColumn === null
  ) {

    return results;

  }


  if (needAorist) {

    const aoristRow =
      findTableRowInRange(
        grid,
        /^aorist(?:\s+simple)?$/i,
        positiveRange.start,
        positiveRange.end
      );


    if (
      aoristRow !== null
    ) {

      const value =
        extractDeclensionCellValue(
          grid[aoristRow]?.[
            thirdPersonColumn
          ]
        );


      if (value) {

        results.push({

          key:
            "aorist",

          label:
            "Aorist",

          value,

          source:
            "wiktionary_conjugation",

          selected:
            true

        });

      }

    }

  }


  if (needContinuous) {

    const continuousRow =
      findTableRowInRange(
        grid,
        /^continuous(?:\s+simple)?$/i,
        positiveRange.start,
        positiveRange.end
      );


    if (
      continuousRow !== null
    ) {

      const value =
        extractDeclensionCellValue(
          grid[continuousRow]?.[
            thirdPersonColumn
          ]
        );


      if (value) {

        results.push({

          key:
            "continuous",

          label:
            "Continuous",

          value,

          source:
            "wiktionary_conjugation",

          selected:
            true

        });

      }

    }

  }


  return results;

}


function findConjugationBlockRange(
  grid,
  blockLabel
) {

  const target =
    normalizeTableLabel(
      blockLabel
    );


  let start = null;


  for (
    let rowIndex = 0;
    rowIndex < grid.length;
    rowIndex += 1
  ) {

    const row =
      grid[rowIndex];


    if (!row) {

      continue;

    }


    const hasTarget =
      row.some(
        (cell) =>
          cell &&
          normalizeTableLabel(
            cell.text
          ) === target
      );


    if (hasTarget) {

      start =
        rowIndex;

      break;

    }

  }


  if (
    start === null
  ) {

    return null;

  }


  let end =
    grid.length;


  for (
    let rowIndex = start + 1;
    rowIndex < grid.length;
    rowIndex += 1
  ) {

    const row =
      grid[rowIndex];


    if (!row) {

      continue;

    }


    const hasAnotherBlock =
      row.some(
        (cell) => {

          if (!cell) {

            return false;

          }


          const text =
            normalizeTableLabel(
              cell.text
            );


          return (
            text !== target &&
            /conjugation$/i.test(
              text
            )
          );

        }
      );


    if (hasAnotherBlock) {

      end =
        rowIndex;

      break;

    }

  }


  return {
    start,
    end
  };

}


function findThirdPersonSingularColumn(
  grid,
  startRow,
  endRow
) {

  for (
    let rowIndex = startRow;
    rowIndex < endRow;
    rowIndex += 1
  ) {

    const row =
      grid[rowIndex];


    if (!row) {

      continue;

    }


    for (
      let columnIndex = 0;
      columnIndex < row.length;
      columnIndex += 1
    ) {

      const cell =
        row[columnIndex];


      if (!cell) {

        continue;

      }


      /*
        Do NOT use normalizeTableLabel() here.

        normalizeTableLabel() intentionally strips trailing
        punctuation, including the closing ")" from:

        3rd person (o)

        That turns it into:

        3rd person (o

        and prevents the conjugation parser from finding the
        third-person singular column.

        Use the real cleaned table text instead.
      */

      const text =
        cleanTableText(
          cell.text
        );


      if (
        /^3rd\s+person\s*\(\s*o\s*\)$/i.test(
          text
        )
      ) {

        return columnIndex;

      }

    }

  }


  return null;

}


function findTableRowInRange(
  grid,
  pattern,
  startRow,
  endRow
) {

  for (
    let rowIndex = startRow;
    rowIndex < endRow;
    rowIndex += 1
  ) {

    const row =
      grid[rowIndex];


    if (!row) {

      continue;

    }


    for (
      const cell
      of row
    ) {

      if (!cell) {

        continue;

      }


      const text =
        normalizeTableLabel(
          cell.text
        );


      if (
        pattern.test(
          text
        )
      ) {

        return rowIndex;

      }

    }

  }


  return null;

}


/* =========================================================
   HEADWORD FORMS
   ========================================================= */

function extractHeadwordForms(
  headwordLine,
  searchedWord
) {

  if (!headwordLine) {

    return [];

  }


  const forms = [];


  const elements =
    Array.from(
      headwordLine.querySelectorAll(
        "i, em, b, strong"
      )
    );


  let currentLabel =
    null;


  let pendingQualifier =
    null;


  for (
    const element
    of elements
  ) {

    const tag =
      element.tagName;


    if (
      tag === "I" ||
      tag === "EM"
    ) {

      const labelText =
        cleanText(
          element.textContent
        );


      if (!labelText) {

        continue;

      }


      const normalizedText =
        labelText
          .toLowerCase()
          .replace(
            /^[,;:()\s]+|[,;:()\s]+$/g,
            ""
          );


      if (
        normalizedText === "or" ||
        normalizedText === "and"
      ) {

        /*
          Connector:
          keep the grammatical label.

          definite accusative
          kütübü
          or
          kütüpü
        */

        continue;

      }


      if (
        isParenthesizedHeadwordQualifier(
          element
        )
      ) {

        /*
          Qualifier for the NEXT alternative form:

          plural kitaplar
          or (obsolete) kütüp

          "obsolete" qualifies kütüp;
          it does not replace "plural".
        */

        pendingQualifier =
          labelText;

        continue;

      }


      currentLabel =
        labelText;


      pendingQualifier =
        null;


      continue;

    }


    if (
      tag !== "B" &&
      tag !== "STRONG"
    ) {

      continue;

    }


    const value =
      cleanText(
        element.textContent
      );


    if (!value) {

      continue;

    }


    if (
      normalizeSearchWord(
        value
      ) ===
        normalizeSearchWord(
          searchedWord
        )
    ) {

      continue;

    }


    if (!currentLabel) {

      continue;

    }


    const normalized =
      normalizeFormLabel(
        currentLabel
      );


    const label =
      pendingQualifier
        ? `${normalized.label} · ${pendingQualifier}`
        : normalized.label;


    addFormIfMissing(
      forms,
      {

        key:
          normalized.key,

        label,

        value,

        source:
          "wiktionary_headword",

        selected:
          true

      }
    );


    pendingQualifier =
      null;

  }


  return forms;

}


function isParenthesizedHeadwordQualifier(
  element
) {

  let wrapper =
    element;


  while (
    wrapper.parentElement &&
    wrapper.parentElement !==
      element.closest(
        ".headword-line"
      )
  ) {

    if (
      wrapper.parentElement.tagName ===
        "A" ||
      wrapper.parentElement.tagName ===
        "SPAN"
    ) {

      wrapper =
        wrapper.parentElement;

      continue;

    }


    break;

  }


  const previousText =
    cleanText(
      wrapper.previousSibling?.textContent
    );


  const nextText =
    cleanText(
      wrapper.nextSibling?.textContent
    );


  return (
    previousText.endsWith("(") &&
    nextText.startsWith(")")
  );

}


/* =========================================================
   FIND THE LABEL BEFORE A HEADWORD FORM
   ========================================================= */

function findPreviousHeadwordLabel(
  formElement
) {

  let current =
    formElement.previousSibling;


  while (current) {

    if (
      current.nodeType ===
      Node.TEXT_NODE
    ) {

      current =
        current.previousSibling;

      continue;

    }


    if (
      current.nodeType ===
      Node.ELEMENT_NODE
    ) {

      if (
        current.tagName === "I" ||
        current.tagName === "EM"
      ) {

        return current;

      }


      const italic =
        current.querySelector?.(
          "i, em"
        );


      if (italic) {

        return italic;

      }


      return null;

    }


    current =
      current.previousSibling;

  }


  return null;

}


/* =========================================================
   NORMALIZE FORM LABEL
   ========================================================= */

function normalizeFormLabel(
  rawLabel
) {

  const cleaned =
    cleanText(
      rawLabel
    )
      .replace(
        /^[,;:()\s]+/,
        ""
      )
      .replace(
        /[,;:()\s]+$/,
        ""
      )
      .trim();


  const lower =
    cleaned.toLowerCase();


  if (
    lower ===
      "definite accusative" ||
    lower ===
      "accusative" ||
    lower.includes(
      "definite accusative"
    )
  ) {

    return {
      key:
        "accusative",

      label:
        "Accusative"
    };

  }


  if (
    lower === "plural" ||
    lower.includes(
      "plural"
    ) &&
    !lower.includes(
      "plural form of"
    )
  ) {

    return {
      key:
        "plural",

      label:
        cleaned
          ? capitalizeFirst(
              cleaned
            )
          : "Plural"
    };

  }


  return {

    key:
      slugifyFormKey(
        cleaned
      ),

    label:
      capitalizeFirst(
        cleaned
      )

  };

}


/* =========================================================
   DECLENSION FALLBACK
   ========================================================= */

function extractMissingFormsFromDeclension(
  posSection,
  {
    needAccusative,
    needPlural
  }
) {

  if (
    !needAccusative &&
    !needPlural
  ) {

    return [];

  }


  const result = [];


  const declensionSections =
    findDeclensionSections(
      posSection
    );


  for (
    const section
    of declensionSections
  ) {

    const tables =
      Array.from(
        section.querySelectorAll(
          "table"
        )
      );


    for (
      const table
      of tables
    ) {

      const extracted =
        extractCoreFormsFromDeclensionTable(
          table,
          {
            needAccusative:
              needAccusative &&
              !result.some(
                (form) =>
                  form.key ===
                  "accusative"
              ),

            needPlural:
              needPlural &&
              !result.some(
                (form) =>
                  form.key ===
                  "plural"
              )
          }
        );


      for (
        const form
        of extracted
      ) {

        addFormIfMissing(
          result,
          form
        );

      }


      const gotAccusative =
        !needAccusative ||
        result.some(
          (form) =>
            form.key ===
            "accusative"
        );


      const gotPlural =
        !needPlural ||
        result.some(
          (form) =>
            form.key ===
            "plural"
        );


      if (
        gotAccusative &&
        gotPlural
      ) {

        return result;

      }

    }

  }


  return result;

}


/* =========================================================
   FIND DECLENSION SECTIONS
   ========================================================= */

function findDeclensionSections(
  posSection
) {

  const result = [];


  if (
    getSectionTitle(
      posSection
    ) === "Declension"
  ) {

    result.push(
      posSection
    );

  }


  for (
    const section
    of posSection.querySelectorAll(
      "section"
    )
  ) {

    if (
      getSectionTitle(
        section
      ) === "Declension"
    ) {

      result.push(
        section
      );

    }

  }


  return result;

}


/* =========================================================
   DECLENSION TABLE PARSER
   ========================================================= */

function extractCoreFormsFromDeclensionTable(
  table,
  {
    needAccusative,
    needPlural
  }
) {

  const results = [];


  const grid =
    buildTableGrid(
      table
    );


  if (
    !grid.length
  ) {

    return results;

  }


  const columns =
    findSingularPluralColumns(
      grid
    );


  if (
    columns.singular === null ||
    columns.plural === null
  ) {

    return results;

  }


  if (
    needAccusative
  ) {

    const accusativeRow =
      findDeclensionRow(
        grid,
        [
          /^definite\s+accusative$/i,
          /^accusative$/i
        ]
      );


    if (
      accusativeRow !== null
    ) {

      const cell =
        grid[
          accusativeRow
        ]?.[
          columns.singular
        ];


      const value =
        extractDeclensionCellValue(
          cell
        );


      if (value) {

        results.push({

          key:
            "accusative",

          label:
            "Accusative",

          value,

          source:
            "wiktionary_declension",

          selected:
            true

        });

      }

    }

  }


  if (
    needPlural
  ) {

    const nominativeRow =
      findDeclensionRow(
        grid,
        [
          /^nominative$/i
        ]
      );


    if (
      nominativeRow !== null
    ) {

      const cell =
        grid[
          nominativeRow
        ]?.[
          columns.plural
        ];


      const value =
        extractDeclensionCellValue(
          cell
        );


      if (value) {

        results.push({

          key:
            "plural",

          label:
            "Plural",

          value,

          source:
            "wiktionary_declension",

          selected:
            true

        });

      }

    }

  }


  return results;

}


/* =========================================================
   BUILD TABLE GRID
   ========================================================= */

function buildTableGrid(
  table
) {

  const rows =
    Array.from(
      table.querySelectorAll(
        ":scope > tbody > tr, :scope > thead > tr, :scope > tr"
      )
    );


  const actualRows =
    rows.length
      ? rows
      : Array.from(
          table.querySelectorAll(
            "tr"
          )
        );


  const grid = [];


  actualRows.forEach(
    (
      row,
      rowIndex
    ) => {

      if (
        !grid[rowIndex]
      ) {

        grid[rowIndex] =
          [];

      }


      const cells =
        Array.from(
          row.children
        )
        .filter(
          (child) =>
            child.tagName ===
              "TH" ||
            child.tagName ===
              "TD"
        );


      let columnIndex =
        0;


      for (
        const cell
        of cells
      ) {

        while (
          grid[rowIndex][
            columnIndex
          ]
        ) {

          columnIndex += 1;

        }


        const rowspan =
          Math.max(
            1,
            Number(
              cell.getAttribute(
                "rowspan"
              )
            ) || 1
          );


        const colspan =
          Math.max(
            1,
            Number(
              cell.getAttribute(
                "colspan"
              )
            ) || 1
          );


        const cellData = {

          element:
            cell,

          text:
            cleanTableText(
              cell.textContent
            ),

          tag:
            cell.tagName

        };


        for (
          let r = 0;
          r < rowspan;
          r += 1
        ) {

          const targetRow =
            rowIndex + r;


          if (
            !grid[targetRow]
          ) {

            grid[targetRow] =
              [];

          }


          for (
            let c = 0;
            c < colspan;
            c += 1
          ) {

            grid[targetRow][
              columnIndex + c
            ] =
              cellData;

          }

        }


        columnIndex +=
          colspan;

      }

    }
  );


  return grid;

}


/* =========================================================
   FIND SINGULAR / PLURAL COLUMNS
   ========================================================= */

function findSingularPluralColumns(
  grid
) {

  let singular = null;
  let plural = null;


  for (
    const row
    of grid
  ) {

    if (!row) {

      continue;

    }


    let rowSingular =
      null;

    let rowPlural =
      null;


    row.forEach(
      (
        cell,
        columnIndex
      ) => {

        if (!cell) {

          return;

        }


        const text =
          normalizeTableLabel(
            cell.text
          );


        if (
          text === "singular"
        ) {

          rowSingular =
            columnIndex;

        }


        if (
          text === "plural"
        ) {

          rowPlural =
            columnIndex;

        }

      }
    );


    if (
      rowSingular !== null &&
      rowPlural !== null &&
      rowSingular !== rowPlural
    ) {

      singular =
        rowSingular;

      plural =
        rowPlural;

      break;

    }

  }


  return {
    singular,
    plural
  };

}


/* =========================================================
   FIND DECLENSION ROW
   ========================================================= */

function findDeclensionRow(
  grid,
  patterns,
  startRow = 0
) {

  for (
    let rowIndex = startRow;
    rowIndex < grid.length;
    rowIndex += 1
  ) {

    const row =
      grid[rowIndex];


    if (!row) {

      continue;

    }


    for (
      const cell
      of row
    ) {

      if (!cell) {

        continue;

      }


      if (
        cell.tag !== "TH"
      ) {

        continue;

      }


      const text =
        normalizeTableLabel(
          cell.text
        );


      if (
        patterns.some(
          (pattern) =>
            pattern.test(
              text
            )
        )
      ) {

        return rowIndex;

      }

    }

  }


  return null;

}


/* =========================================================
   EXTRACT DECLENSION CELL VALUE
   ========================================================= */

function extractDeclensionCellValue(
  cell
) {

  if (
    !cell ||
    !cell.element
  ) {

    return null;

  }


  const clone =
    cell.element.cloneNode(
      true
    );


  clone
    .querySelectorAll(
      "sup, style, .mw-ref"
    )
    .forEach(
      (element) =>
        element.remove()
    );


  const value =
    cleanText(
      clone.textContent
    );


  if (!value) {

    return null;

  }


  if (
    value === "-" ||
    value === "—" ||
    value === "–"
  ) {

    return null;

  }


  if (
    value.length > 80
  ) {

    return null;

  }


  return value;

}


/* =========================================================
   ADD FORM WITHOUT DUPLICATION
   ========================================================= */

function addFormIfMissing(
  forms,
  form
) {

  const exists =
    forms.some(
      (existing) =>
        normalizeFormValue(
          existing.value
        ) ===
          normalizeFormValue(
            form.value
          ) &&
        existing.key ===
          form.key
    );


  if (!exists) {

    forms.push(
      form
    );

  }

}


function normalizeFormValue(
  value
) {

  return String(value || "")
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase(
      "tr-TR"
    );

}


/* =========================================================
   MEANINGS
   ========================================================= */

function extractMeanings(
  posSection
) {

  let meaningsList =
    null;


  for (
    const child
    of posSection.children
  ) {

    if (
      child.tagName === "OL"
    ) {

      meaningsList =
        child;

      break;

    }

  }


  if (!meaningsList) {

    return [];

  }


  const items =
    Array
      .from(
        meaningsList.children
      )
      .filter(
        (child) =>
          child.tagName === "LI"
      );


  const meanings = [];


  for (
    const item
    of items
  ) {

    const meaningText =
      extractMeaningText(
        item
      );


    if (!meaningText) {

      continue;

    }


    meanings.push({

      position:
        meanings.length + 1,

      usageLabel:
        extractMeaningUsageLabel(
          item
        ),

      meaning:
        ensureTerminalPunctuation(
          meaningText
        ),

      examples:
        extractExamples(
          item
        ),

      selected:
        true

    });

  }


  return meanings;

}


/* =========================================================
   USAGE LABEL
   ========================================================= */

function extractMeaningUsageLabel(
  item
) {

  const label =
    item.querySelector(
      ":scope > .usage-label-sense"
    ) ||
    item.querySelector(
      ".usage-label-sense"
    );


  if (!label) {

    return null;

  }


  const text =
    cleanText(
      label.textContent
    )
      .replace(
        /^\(/,
        ""
      )
      .replace(
        /\)$/,
        ""
      )
      .trim();


  return text || null;

}


/* =========================================================
   MEANING TEXT
   ========================================================= */

function extractMeaningText(
  item
) {

  const clone =
    item.cloneNode(
      true
    );


  clone
    .querySelectorAll(
      "dl, ul, ol, table, figure, style, sup.mw-ref"
    )
    .forEach(
      (element) =>
        element.remove()
    );


  clone
    .querySelectorAll(
      ".usage-label-sense"
    )
    .forEach(
      (element) =>
        element.remove()
    );


  return cleanText(
    clone.textContent
  );

}


/* =========================================================
   EXAMPLES
   ========================================================= */

function extractExamples(
  meaningItem
) {

  const results = [];

  const seen =
    new Set();


  const exampleElements =
    meaningItem.querySelectorAll(
      ".h-usage-example"
    );


  for (
    const exampleElement
    of exampleElements
  ) {

    const sourceElement =
      exampleElement.querySelector(
        ".e-example"
      );


    const translationElement =
      exampleElement.querySelector(
        ".e-translation"
      );


    const source =
      sourceElement
        ? ensureTerminalPunctuation(
            sourceElement.textContent
          )
        : null;


    const translation =
      translationElement
        ? ensureTerminalPunctuation(
            translationElement.textContent
          )
        : null;


    if (
      !source &&
      !translation
    ) {

      continue;

    }


    const key =
      `${source || ""}|${translation || ""}`;


    if (
      seen.has(
        key
      )
    ) {

      continue;

    }


    seen.add(
      key
    );


    results.push({

      text:
        source,

      translation

    });


    if (
      results.length >= 8
    ) {

      break;

    }

  }


  return results;

}


/* =========================================================
   POS NOTES
   ========================================================= */

function extractPosNotes(
  posSection
) {

  const notes = [];


  const relevantSections =
    Array
      .from(
        posSection.querySelectorAll(
          "section"
        )
      )
      .filter(
        (section) => {

          const title =
            getSectionTitle(
              section
            );


          return (
            title === "Usage notes" ||
            title === "Declension"
          );

        }
      );


  for (
    const section
    of relevantSections
  ) {

    const sectionTitle =
      getSectionTitle(
        section
      );


    for (
      const child
      of section.children
    ) {

      if (
        /^H[1-6]$/.test(
          child.tagName
        )
      ) {

        continue;

      }


      if (
        [
          "TABLE",
          "STYLE",
          "FIGURE"
        ].includes(
          child.tagName
        )
      ) {

        continue;

      }


      if (
        child.querySelector &&
        child.querySelector(
          "table"
        )
      ) {

        continue;

      }


      const text =
        cleanText(
          child.textContent
        );


      if (
        !text ||
        text.length < 15
      ) {

        continue;

      }


      notes.push({

        section:
          sectionTitle,

        text:
          ensureTerminalPunctuation(
            text
          ),

        selected:
          true

      });

    }

  }


  return dedupeNotes(
    notes
  );

}


function dedupeNotes(
  notes
) {

  const seen =
    new Set();


  return notes.filter(
    (note) => {

      const key =
        `${note.section}|${note.text}`;


      if (
        seen.has(
          key
        )
      ) {

        return false;

      }


      seen.add(
        key
      );


      return true;

    }
  );

}


/* =========================================================
   PUNCTUATION
   ========================================================= */

function ensureTerminalPunctuation(
  value
) {

  const text =
    cleanText(
      value
    );


  if (!text) {

    return "";

  }


  if (
    /[.!?…]$/.test(
      text
    )
  ) {

    return text;

  }


  return `${text}.`;

}


/* =========================================================
   RENDER
   ========================================================= */

function renderWords() {

  hideStatus();


  resultsHeader.hidden =
    false;


  wordTitle.textContent =
    currentWord;


  entryCount.textContent =
    `${parsedWords.length} ${
      parsedWords.length === 1
        ? "word"
        : "words"
    } found`;


  entriesContainer.innerHTML =
    "";


  parsedWords.forEach(
    (wordEntry) => {

      const existing =
        findExistingWord(
          wordEntry
        );


      entriesContainer.appendChild(
        renderWordCard(
          wordEntry,
          existing
        )
      );

    }
  );


  updateSelectedCount();

}


/* =========================================================
   EXISTING WORD
   ========================================================= */

function findExistingWord(
  wordEntry
) {

  return existingWords.find(
    (saved) =>
      normalizeSearchWord(
        saved.word
      ) ===
        normalizeSearchWord(
          wordEntry.word
        ) &&
      Number(
        saved.etymology
      ) ===
        Number(
          wordEntry.etymology
        )
  );

}


/* =========================================================
   WORD CARD
   ========================================================= */

function renderWordCard(
  wordEntry,
  existing
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    existing
      ? "wiki-entry-card wiki-entry-existing"
      : "wiki-entry-card wiki-entry-new";


  if (existing) {

    wordEntry.selected =
      false;

  }


  card.innerHTML = `

    <div class="wiki-entry-top">

      <div class="wiki-word-heading">

        <div class="wiki-etymology">
          WORD ${wordEntry.etymology}
        </div>

        <div
          class="wiki-entry-status ${
            existing
              ? "saved"
              : "new"
          }"
        >
          ${
            existing
              ? "Already saved"
              : "New word"
          }
        </div>

      </div>


      ${
        existing
          ? `
            <div
              class="wiki-saved-mark"
              aria-label="Already saved"
            >
              ✓
            </div>
          `
          : `
            <label
              class="wiki-entry-select"
              title="Save this word"
            >

              <input
                type="checkbox"
                class="wiki-entry-main-checkbox"
                checked
              />

              <span></span>

            </label>
          `
      }

    </div>


    ${
      existing
        ? renderExistingWordPreview(
            wordEntry
          )
        : `
          ${
            renderAlternativeForms(
              wordEntry,
              false
            )
          }

          ${
            wordEntry.etymologyText
              ? renderEtymology(
                  wordEntry,
                  false
                )
              : ""
          }

          ${
            renderBaseWord(
              wordEntry,
              false
            )
          }

          ${
            renderPronunciation(
              wordEntry,
              false
            )
          }

          ${
            wordEntry.partsOfSpeech
              .map(
                (pos) =>
                  renderPartOfSpeech(
                    pos,
                    false
                  )
              )
              .join("")
          }
        `
    }

  `;


  if (
    !existing
  ) {

    wireWordCard(
      card,
      wordEntry
    );

  }


  return card;

}


/* =========================================================
   EXISTING WORD PREVIEW

   Already-saved words are read-only here.
   Show only the first 3 meanings, if any.
   ========================================================= */

function renderExistingWordPreview(
  wordEntry
) {

  const meanings = [];


  for (
    const pos
    of wordEntry.partsOfSpeech
  ) {

    for (
      const meaning
      of pos.meanings
    ) {

      meanings.push({
        pos:
          pos.partOfSpeech,

        ...meaning
      });

    }

  }


  const firstThree =
    meanings
      .slice(
        0,
        3
      );


  if (
    !firstThree.length
  ) {

    return "";

  }


  return `

    <section
      class="wiki-pos-section wiki-existing-preview"
    >

      <div
        class="wiki-pos-subsection wiki-meanings-section"
      >

        <h3>
          Meanings
        </h3>


        <div
          class="wiki-meaning-list"
        >

          ${
            firstThree
              .map(
                (
                  meaning,
                  index
                ) => `

                  <div
                    class="wiki-meaning-block"
                  >

                    <div
                      class="wiki-meaning-row"
                    >

                      <span
                        class="wiki-meaning-number"
                      >
                        ${index + 1}.
                      </span>


                      <span
                        class="wiki-meaning-text"
                      >

                        ${
                          meaning.usageLabel
                            ? `
                              <small
                                class="wiki-usage-label"
                              >
                                ${escapeHtml(meaning.usageLabel)}
                              </small>
                            `
                            : ""
                        }

                        ${escapeHtml(meaning.meaning)}

                      </span>

                    </div>

                  </div>

                `
              )
              .join("")
          }

        </div>

      </div>

    </section>

  `;

}


/* =========================================================
   ALTERNATIVE FORMS UI
   ========================================================= */

function renderAlternativeForms(
  wordEntry,
  existing
) {

  if (
    !wordEntry.alternativeForms.length
  ) {

    return "";

  }


  return `

    <section
      class="wiki-entry-section wiki-alternative-forms-section"
    >

      <h3>
        Alternative forms
      </h3>


      <div class="wiki-choice-list">

        ${
          wordEntry.alternativeForms
            .map(
              (
                alternativeForm,
                index
              ) => `

                <label class="wiki-choice-row">

                  ${
                    existing
                      ? ""
                      : `
                        <input
                          type="checkbox"
                          data-kind="alternative-form"
                          data-index="${index}"
                          checked
                        />

                        <span
                          class="wiki-custom-check"
                        ></span>
                      `
                  }


                  <span
                    class="wiki-choice-content"
                  >

                    <strong>
                      ${escapeHtml(alternativeForm.value)}
                    </strong>

                    ${
                      alternativeForm.usageLabel
                        ? `
                          <small>
                            ${escapeHtml(alternativeForm.usageLabel)}
                          </small>
                        `
                        : ""
                    }

                  </span>

                </label>

              `
            )
            .join("")
        }

      </div>

    </section>

  `;

}


/* =========================================================
   ETYMOLOGY UI
   ========================================================= */

function renderEtymology(
  wordEntry,
  existing
) {

  return `

    <section
      class="wiki-entry-section wiki-etymology-section"
    >

      <div
        class="wiki-etymology-section-head"
      >

        <div
          class="wiki-etymology-title-wrap"
        >

          ${
            existing
              ? ""
              : `
                <label
                  class="wiki-etymology-toggle"
                  title="Include etymology"
                >

                  <input
                    type="checkbox"
                    data-kind="etymology"
                    checked
                  />

                  <span
                    class="wiki-custom-check"
                  ></span>

                </label>
              `
          }

          <h3>
            Etymology
          </h3>

        </div>


        ${
          existing
            ? ""
            : `
              <button
                type="button"
                class="wiki-etymology-edit-button"
                data-action="edit-etymology"
              >
                Edit
              </button>
            `
        }

      </div>


      <p
        class="wiki-etymology-text"
        data-role="etymology-text"
      >
        ${escapeHtml(wordEntry.etymologyText)}
      </p>


      ${
        existing
          ? ""
          : renderEtymologyEditor(
              wordEntry
            )
      }

    </section>

  `;

}


function renderEtymologyEditor(
  wordEntry
) {

  return `

    <div
      class="wiki-etymology-editor"
      data-role="etymology-editor"
      hidden
    >

      <textarea
        class="wiki-etymology-textarea"
        data-role="etymology-textarea"
        rows="8"
        spellcheck="false"
      >${escapeHtml(wordEntry.etymologyText)}</textarea>


      <div
        class="wiki-etymology-editor-actions"
      >

        <button
          type="button"
          class="wiki-etymology-cancel-button"
          data-action="cancel-etymology"
        >
          Cancel
        </button>


        <button
          type="button"
          class="wiki-etymology-done-button"
          data-action="done-etymology"
        >
          Done
        </button>

      </div>

    </div>

  `;

}


/* =========================================================
   BASE WORD UI

   Independent from Etymology.
   Always shown for new entries.
   ========================================================= */

function renderBaseWord(
  wordEntry,
  existing
) {

  return `

    <section
      class="wiki-entry-section wiki-base-word-section"
    >

      <h3>
        Base word
      </h3>


      ${
        existing
          ? `
            <div
              class="wiki-base-word-existing"
            >
              ${
                wordEntry.baseWordText
                  ? escapeHtml(wordEntry.baseWordText)
                  : "—"
              }
            </div>
          `
          : `
            <div
              class="wiki-base-word-search-row"
            >

              <input
                type="text"
                class="wiki-base-word-input"
                data-role="base-word-input"
                value="${escapeAttribute(wordEntry.baseWordText || "")}"
                placeholder="Type a base word"
                autocomplete="off"
                spellcheck="false"
              />


              <button
                type="button"
                class="wiki-base-word-search-button"
                data-action="search-base-word"
              >
                Search
              </button>

            </div>


            <div
              class="wiki-base-word-results"
              data-role="base-word-results"
              hidden
            ></div>
          `
      }

    </section>

  `;

}


/* =========================================================
   PRONUNCIATION UI
   ========================================================= */

function renderPronunciation(
  wordEntry,
  existing
) {

  if (
    !wordEntry.pronunciation.length
  ) {

    return "";

  }


  return `

    <section
      class="wiki-entry-section wiki-pronunciation-section"
    >

      <h3>
        Pronunciation
      </h3>


      <div class="wiki-choice-list">

        ${
          wordEntry.pronunciation
            .map(
              (
                pronunciation,
                index
              ) => `

                <label class="wiki-choice-row">

                  ${
                    existing
                      ? ""
                      : `
                        <input
                          type="checkbox"
                          data-kind="pronunciation"
                          data-index="${index}"
                          checked
                        />

                        <span
                          class="wiki-custom-check"
                        ></span>
                      `
                  }


                  <span
                    class="wiki-choice-content"
                  >

                    <strong
                      class="wiki-ipa"
                    >
                      ${escapeHtml(pronunciation.ipa)}
                    </strong>

                    ${
                      pronunciation.label
                        ? `
                          <small>
                            ${escapeHtml(pronunciation.label)}
                          </small>
                        `
                        : ""
                    }

                  </span>

                </label>

              `
            )
            .join("")
        }

      </div>

    </section>

  `;

}


/* =========================================================
   POS UI
   ========================================================= */

function renderPartOfSpeech(
  pos,
  existing
) {

  return `

    <section
      class="wiki-pos-section"
    >

      <div
        class="wiki-pos-title"
      >
        ${escapeHtml(pos.partOfSpeech)}
      </div>


      ${
        renderForms(
          pos,
          existing
        )
      }


      ${
        renderMeanings(
          pos,
          existing
        )
      }


      ${
        renderPosNotes(
          pos,
          existing
        )
      }

    </section>

  `;

}


/* =========================================================
   FORMS UI
   ========================================================= */

function renderForms(
  pos,
  existing
) {

  if (
    !pos.forms.length
  ) {

    return "";

  }


  const groups =
    groupFormsForRendering(
      pos.forms
    );


  return `

    <div
      class="wiki-pos-subsection wiki-forms-section"
    >

      <h3>
        Forms
      </h3>


      <div
        class="wiki-form-grid"
      >

        ${
          groups
            .map(
              (group) => `

                <div
                  class="wiki-form-group"
                  data-form-key="${escapeAttribute(group.key)}"
                >

                  <div
                    class="wiki-choice-list"
                  >

                    ${
                      group.items
                        .map(
                          ({
                            form,
                            index
                          }) => `

                            <label
                              class="wiki-form-chip"
                            >

                              ${
                                existing
                                  ? ""
                                  : `
                                    <input
                                      type="checkbox"
                                      data-kind="form"
                                      data-pos="${escapeAttribute(pos.partOfSpeech)}"
                                      data-index="${index}"
                                      checked
                                    />
                                  `
                              }


                              <span>

                                <small>
                                  ${escapeHtml(form.label)}
                                </small>

                                <strong>
                                  ${escapeHtml(form.value)}
                                </strong>

                              </span>

                            </label>

                          `
                        )
                        .join("")
                    }

                  </div>

                </div>

              `
            )
            .join("")
        }

      </div>

    </div>

  `;

}


/* =========================================================
   GROUP FORMS FOR UI

   The grammatical key controls the column.
   Each individual form keeps its own label/qualifier.

   Example:

   accusative -> kütübü
   accusative -> kütüpü

   plural -> kitaplar
   plural · obsolete -> kütüp
   ========================================================= */

function groupFormsForRendering(
  forms
) {

  const groups = [];

  const byKey =
    new Map();


  forms.forEach(
    (
      form,
      index
    ) => {

      let group =
        byKey.get(
          form.key
        );


      if (!group) {

        group = {

          key:
            form.key,

          items:
            []

        };


        byKey.set(
          form.key,
          group
        );


        groups.push(
          group
        );

      }


      group.items.push({
        form,
        index
      });

    }
  );


  return groups;

}


/* =========================================================
   MEANINGS UI
   ========================================================= */

function renderMeanings(
  pos,
  existing
) {

  if (
    !pos.meanings.length
  ) {

    return "";

  }


  return `

    <div
      class="wiki-pos-subsection wiki-meanings-section"
    >

      <h3>
        Meanings
      </h3>


      <div
        class="wiki-meaning-list"
      >

        ${
          pos.meanings
            .map(
              (meaning) =>
                renderMeaningBlock(
                  pos,
                  meaning,
                  existing
                )
            )
            .join("")
        }

      </div>

    </div>

  `;

}


function renderMeaningBlock(
  pos,
  meaning,
  existing
) {

  return `

    <div
      class="wiki-meaning-block"
      data-pos="${escapeAttribute(pos.partOfSpeech)}"
      data-meaning-position="${meaning.position}"
    >

      <label
        class="wiki-meaning-row"
      >

        ${
          existing
            ? ""
            : `
              <input
                type="checkbox"
                data-kind="meaning"
                data-pos="${escapeAttribute(pos.partOfSpeech)}"
                data-position="${meaning.position}"
                checked
              />

              <span
                class="wiki-custom-check"
              ></span>
            `
        }


        <span
          class="wiki-meaning-number"
        >
          ${meaning.position}.
        </span>


        <span
          class="wiki-meaning-text"
        >

          ${
            meaning.usageLabel
              ? `
                <small
                  class="wiki-usage-label"
                >
                  ${escapeHtml(meaning.usageLabel)}
                </small>
              `
              : ""
          }

          ${escapeHtml(meaning.meaning)}

        </span>

      </label>


      ${
        meaning.examples.length
          ? `
            <div
              class="wiki-meaning-examples"
            >

              ${
                meaning.examples
                  .map(
                    (example) => `

                      <div
                        class="wiki-example-item"
                      >

                        ${
                          example.text
                            ? `
                              <div
                                class="wiki-example-source"
                              >
                                ${escapeHtml(example.text)}
                              </div>
                            `
                            : ""
                        }

                        ${
                          example.translation
                            ? `
                              <div
                                class="wiki-example-translation"
                              >
                                ${escapeHtml(example.translation)}
                              </div>
                            `
                            : ""
                        }

                      </div>

                    `
                  )
                  .join("")
              }

            </div>
          `
          : ""
      }

    </div>

  `;

}


/* =========================================================
   NOTES UI
   ========================================================= */

function renderPosNotes(
  pos,
  existing
) {

  if (
    !pos.notes.length
  ) {

    return "";

  }


  return `

    <div
      class="wiki-pos-subsection wiki-notes-section"
    >

      <h3>
        Notes
      </h3>


      <div
        class="wiki-note-list"
      >

        ${
          pos.notes
            .map(
              (
                note,
                index
              ) => `

                <label
                  class="wiki-note"
                >

                  ${
                    existing
                      ? ""
                      : `
                        <input
                          type="checkbox"
                          data-kind="pos-note"
                          data-pos="${escapeAttribute(pos.partOfSpeech)}"
                          data-index="${index}"
                          checked
                        />

                        <span
                          class="wiki-custom-check"
                        ></span>
                      `
                  }


                  <span>

                    <small>
                      ${escapeHtml(note.section)}
                    </small>

                    <strong>
                      ${escapeHtml(note.text)}
                    </strong>

                  </span>

                </label>

              `
            )
            .join("")
        }

      </div>

    </div>

  `;

}


/* =========================================================
   CARD EVENTS
   ========================================================= */

function wireWordCard(
  card,
  wordEntry
) {

  const mainCheckbox =
    card.querySelector(
      ".wiki-entry-main-checkbox"
    );


  mainCheckbox.addEventListener(
    "change",
    () => {

      wordEntry.selected =
        mainCheckbox.checked;


      if (
        wordEntry.selected
      ) {

        resetWordSelection(
          card,
          wordEntry
        );

      } else {

        resetWordSelection(
          card,
          wordEntry
        );

      }


      setInternalControlsDisabled(
        card,
        !wordEntry.selected
      );


      card.classList.toggle(
        "entry-not-selected",
        !wordEntry.selected
      );


      updateSelectedCount();

    }
  );


  wireEtymologyControls(
    card,
    wordEntry
  );


  wireBaseWordControls(
    card,
    wordEntry
  );


  wireAlternativeFormCheckboxes(
    card,
    wordEntry
  );


  wirePronunciationCheckboxes(
    card,
    wordEntry
  );


  wireFormCheckboxes(
    card,
    wordEntry
  );


  wireMeaningCheckboxes(
    card,
    wordEntry
  );


  wireNoteCheckboxes(
    card,
    wordEntry
  );

}


/* =========================================================
   ETYMOLOGY EVENTS
   ========================================================= */

function wireEtymologyControls(
  card,
  wordEntry
) {

  const checkbox =
    card.querySelector(
      'input[data-kind="etymology"]'
    );


  const editButton =
    card.querySelector(
      '[data-action="edit-etymology"]'
    );


  const doneButton =
    card.querySelector(
      '[data-action="done-etymology"]'
    );


  const cancelButton =
    card.querySelector(
      '[data-action="cancel-etymology"]'
    );


  const editor =
    card.querySelector(
      '[data-role="etymology-editor"]'
    );


  const textarea =
    card.querySelector(
      '[data-role="etymology-textarea"]'
    );


  const textDisplay =
    card.querySelector(
      '[data-role="etymology-text"]'
    );


  let editOriginalText =
    wordEntry.etymologyText;


  if (checkbox) {

    const updateEtymologyEditState =
      () => {

        wordEntry.etymologySelected =
          checkbox.checked;


        card
          .querySelector(
            ".wiki-etymology-section"
          )
          ?.classList.toggle(
            "wiki-etymology-not-selected",
            !checkbox.checked
          );


        if (editButton) {

          editButton.disabled =
            !checkbox.checked;

        }


        if (
          !checkbox.checked &&
          editor
        ) {

          editor.hidden =
            true;


          if (editButton) {

            editButton.hidden =
              false;

          }

        }

      };


    checkbox.addEventListener(
      "change",
      updateEtymologyEditState
    );


    updateEtymologyEditState();

  }


  if (
    editButton &&
    editor &&
    textarea
  ) {

    editButton.addEventListener(
      "click",
      () => {

        editOriginalText =
          wordEntry.etymologyText;


        textarea.value =
          wordEntry.etymologyText;


        editor.hidden =
          false;


        editButton.hidden =
          true;


        textarea.focus();


        textarea.setSelectionRange(
          textarea.value.length,
          textarea.value.length
        );

      }
    );

  }


  if (textarea) {

    textarea.addEventListener(
      "input",
      () => {

        wordEntry.etymologyText =
          textarea.value;


        cacheEtymologyText(
          wordEntry
        );


        if (textDisplay) {

          textDisplay.textContent =
            wordEntry.etymologyText;

        }

      }
    );

  }


  if (
    doneButton &&
    editor
  ) {

    doneButton.addEventListener(
      "click",
      () => {

        editor.hidden =
          true;


        if (editButton) {

          editButton.hidden =
            false;

        }

      }
    );

  }


  if (
    cancelButton &&
    editor &&
    textarea
  ) {

    cancelButton.addEventListener(
      "click",
      () => {

        wordEntry.etymologyText =
          editOriginalText;


        textarea.value =
          editOriginalText;


        if (textDisplay) {

          textDisplay.textContent =
            editOriginalText;

        }


        cacheEtymologyText(
          wordEntry
        );


        editor.hidden =
          true;


        if (editButton) {

          editButton.hidden =
            false;

        }

      }
    );

  }

}


/* =========================================================
   BASE WORD EVENTS

   Search currently checks entries already loaded in the
   dictionary cache/state available to this page.

   No base is inferred automatically.
   ========================================================= */

function wireBaseWordControls(
  card,
  wordEntry
) {

  const input =
    card.querySelector(
      '[data-role="base-word-input"]'
    );


  const searchButton =
    card.querySelector(
      '[data-action="search-base-word"]'
    );


  const results =
    card.querySelector(
      '[data-role="base-word-results"]'
    );


  if (input) {

    input.addEventListener(
      "input",
      () => {

        wordEntry.baseWordText =
          normalizeSearchWord(
            input.value
          );


        wordEntry.baseWordId =
          null;


        wordEntry.baseWordSelected =
          false;

      }
    );

  }


  if (
    searchButton &&
    input &&
    results
  ) {

    searchButton.addEventListener(
      "click",
      async () => {

        const baseWord =
          normalizeSearchWord(
            input.value
          );


        input.value =
          baseWord;


        wordEntry.baseWordText =
          baseWord;


        wordEntry.baseWordId =
          null;


        wordEntry.baseWordSelected =
          false;


        if (!baseWord) {

          results.hidden =
            false;

          results.innerHTML = `
            <div
              class="wiki-base-word-message"
            >
              Type a base word first.
            </div>
          `;

          return;

        }


        searchButton.disabled =
          true;

        searchButton.textContent =
          "Searching...";


        try {

          const {
            data,
            error
          } = await supabase
            .from("turkish_words")
            .select(`
              id,
              word,
              etymology,
              turkish_meanings (
                part_of_speech,
                position,
                meaning
              )
            `)
            .eq(
              "word",
              baseWord
            );


          if (error) {

            throw error;

          }


          renderBaseWordMatches(
            results,
            wordEntry,
            data || []
          );

        } catch (error) {

          console.error(
            "Could not search base word:",
            error
          );


          results.hidden =
            false;

          results.innerHTML = `
            <div
              class="wiki-base-word-message"
            >
              Could not search My Dictionary.
            </div>
          `;

        } finally {

          searchButton.disabled =
            false;

          searchButton.textContent =
            "Search";

        }

      }
    );

  }

}


function renderBaseWordMatches(
  container,
  wordEntry,
  matches
) {

  container.hidden =
    false;


  const radioName =
    `base-word-${escapeAttribute(wordEntry.word)}-${wordEntry.etymology}`;


  if (
    !matches.length
  ) {

    container.innerHTML = `

      <label
        class="wiki-base-word-option wiki-base-word-manual-option"
      >

        <input
          type="checkbox"
          name="${radioName}"
          data-base-word-manual="true"
        />

        <span
          class="wiki-base-word-radio"
        ></span>

        <span
          class="wiki-base-word-option-content"
        >

          <strong>
            ${escapeHtml(wordEntry.baseWordText)}
          </strong>

          <small
            class="wiki-base-word-not-found"
          >
            Not found
          </small>

        </span>

      </label>

    `;

  } else {

    const options = [];


    for (
      const match
      of matches
    ) {

      const meanings =
        Array.isArray(
          match.turkish_meanings
        )
          ? match.turkish_meanings
          : [];


      const firstThree =
        meanings
          .slice()
          .sort(
            (
              a,
              b
            ) => {

              const posCompare =
                String(
                  a.part_of_speech || ""
                )
                  .localeCompare(
                    String(
                      b.part_of_speech || ""
                    )
                  );


              if (
                posCompare !== 0
              ) {

                return posCompare;

              }


              return (
                Number(
                  a.position || 0
                ) -
                Number(
                  b.position || 0
                )
              );

            }
          )
          .slice(
            0,
            3
          );


      options.push(`

        <label
          class="wiki-base-word-option"
        >

          <input
            type="checkbox"
            name="${radioName}"
            value="${match.id}"
            data-base-word-id="${match.id}"
          />

          <span
            class="wiki-base-word-radio"
          ></span>

          <span
            class="wiki-base-word-option-content"
          >

            <strong>
              WORD ${match.etymology} · ID ${match.id}
            </strong>

            ${
              firstThree.length
                ? `
                  <span
                    class="wiki-base-word-meaning-list"
                  >
                    ${
                      firstThree
                        .map(
                          (
                            meaning,
                            index
                          ) => `
                            <small
                              class="wiki-base-word-meaning"
                            >
                              ${index + 1}. ${escapeHtml(meaning.meaning)}
                            </small>
                          `
                        )
                        .join("")
                    }
                  </span>
                `
                : `
                  <small
                    class="wiki-base-word-no-meanings"
                  >
                    No meanings available
                  </small>
                `
            }

          </span>

        </label>

      `);

    }


    container.innerHTML =
      options.join("");

  }


  const choices =
    Array.from(
      container.querySelectorAll(
        'input[type="checkbox"]'
      )
    );


  choices.forEach(
    (choice) => {

      choice.addEventListener(
        "change",
        () => {

          if (
            choice.checked
          ) {

            choices
              .filter(
                (other) =>
                  other !== choice
              )
              .forEach(
                (other) => {

                  other.checked =
                    false;

                }
              );


            wordEntry.baseWordSelected =
              true;


            wordEntry.baseWordId =
              choice.dataset.baseWordId
                ? Number(
                    choice.dataset.baseWordId
                  )
                : null;

          } else {

            wordEntry.baseWordSelected =
              false;


            wordEntry.baseWordId =
              null;

          }

        }
      );

    }
  );

}


/* =========================================================
   RESET WORD SELECTION
   ========================================================= */

function resetWordSelection(
  card,
  wordEntry
) {

  wordEntry.etymologySelected =
    true;


  wordEntry.baseWordSelected =
    false;


  wordEntry.baseWordId =
    null;


  const baseWordResults =
    card.querySelector(
      '[data-role="base-word-results"]'
    );


  if (baseWordResults) {

    baseWordResults.hidden =
      true;

    baseWordResults.innerHTML =
      "";

  }


  const etymologyCheckbox =
    card.querySelector(
      'input[data-kind="etymology"]'
    );


  if (etymologyCheckbox) {

    etymologyCheckbox.checked =
      true;

  }


  card
    .querySelector(
      ".wiki-etymology-section"
    )
    ?.classList.remove(
      "wiki-etymology-not-selected"
    );


  wordEntry.alternativeForms.forEach(
    (item) => {

      item.selected =
        true;

    }
  );


  wordEntry.pronunciation.forEach(
    (item) => {

      item.selected =
        true;

    }
  );


  wordEntry.partsOfSpeech.forEach(
    (pos) => {

      pos.forms.forEach(
        (form) => {

          form.selected =
            true;

        }
      );


      pos.meanings.forEach(
        (meaning) => {

          meaning.selected =
            true;

        }
      );


      pos.notes.forEach(
        (note) => {

          note.selected =
            true;

        }
      );

    }
  );


  card
    .querySelectorAll(`
      input[data-kind="etymology"],
      input[data-role="base-word-input"],
      input[data-kind="alternative-form"],
      input[data-kind="pronunciation"],
      input[data-kind="form"],
      input[data-kind="meaning"],
      input[data-kind="pos-note"]
    `)
    .forEach(
      (inputElement) => {

        inputElement.checked =
          true;

      }
    );


  card
    .querySelectorAll(
      ".wiki-meaning-not-selected"
    )
    .forEach(
      (element) => {

        element.classList.remove(
          "wiki-meaning-not-selected"
        );

      }
    );

}


/* =========================================================
   INTERNAL LOCK
   ========================================================= */

function setInternalControlsDisabled(
  card,
  disabled
) {

  card
    .querySelectorAll(`
      input[data-kind="etymology"],
      input[data-role="base-word-input"],
      input[data-kind="alternative-form"],
      input[data-kind="pronunciation"],
      input[data-kind="form"],
      input[data-kind="meaning"],
      input[data-kind="pos-note"]
    `)
    .forEach(
      (inputElement) => {

        inputElement.disabled =
          disabled;

      }
    );


  card
    .querySelectorAll(`
      button[data-action="edit-etymology"],
      button[data-action="cancel-etymology"],
      button[data-action="done-etymology"],
      button[data-action="search-base-word"]
    `)
    .forEach(
      (buttonElement) => {

        buttonElement.disabled =
          disabled ||
          (
            buttonElement.dataset.action ===
              "edit-etymology" &&
            !card.querySelector(
              'input[data-kind="etymology"]'
            )?.checked
          );

      }
    );


  card.classList.toggle(
    "wiki-content-disabled",
    disabled
  );

}


/* =========================================================
   ALTERNATIVE FORM EVENTS
   ========================================================= */

function wireAlternativeFormCheckboxes(
  card,
  wordEntry
) {

  card
    .querySelectorAll(
      'input[data-kind="alternative-form"]'
    )
    .forEach(
      (checkbox) => {

        checkbox.addEventListener(
          "change",
          () => {

            const index =
              Number(
                checkbox.dataset.index
              );


            if (
              wordEntry.alternativeForms[
                index
              ]
            ) {

              wordEntry
                .alternativeForms[index]
                .selected =
                  checkbox.checked;

            }

          }
        );

      }
    );

}


/* =========================================================
   PRONUNCIATION EVENTS
   ========================================================= */

function wirePronunciationCheckboxes(
  card,
  wordEntry
) {

  card
    .querySelectorAll(
      'input[data-kind="pronunciation"]'
    )
    .forEach(
      (checkbox) => {

        checkbox.addEventListener(
          "change",
          () => {

            const index =
              Number(
                checkbox.dataset.index
              );


            if (
              wordEntry.pronunciation[
                index
              ]
            ) {

              wordEntry
                .pronunciation[index]
                .selected =
                  checkbox.checked;

            }

          }
        );

      }
    );

}


/* =========================================================
   FORM EVENTS
   ========================================================= */

function wireFormCheckboxes(
  card,
  wordEntry
) {

  card
    .querySelectorAll(
      'input[data-kind="form"]'
    )
    .forEach(
      (checkbox) => {

        checkbox.addEventListener(
          "change",
          () => {

            const pos =
              findPosByName(
                wordEntry,
                checkbox.dataset.pos
              );


            if (!pos) {

              return;

            }


            const index =
              Number(
                checkbox.dataset.index
              );


            if (
              pos.forms[
                index
              ]
            ) {

              pos
                .forms[index]
                .selected =
                  checkbox.checked;

            }

          }
        );

      }
    );

}


/* =========================================================
   MEANING EVENTS
   ========================================================= */

function wireMeaningCheckboxes(
  card,
  wordEntry
) {

  card
    .querySelectorAll(
      'input[data-kind="meaning"]'
    )
    .forEach(
      (checkbox) => {

        checkbox.addEventListener(
          "change",
          () => {

            const pos =
              findPosByName(
                wordEntry,
                checkbox.dataset.pos
              );


            if (!pos) {

              return;

            }


            const position =
              Number(
                checkbox.dataset.position
              );


            const meaning =
              pos.meanings.find(
                (item) =>
                  item.position ===
                  position
              );


            if (meaning) {

              meaning.selected =
                checkbox.checked;

            }


            updateMeaningVisualState(
              card,
              checkbox
            );


            if (
              !hasAnySelectedMeaning(
                wordEntry
              )
            ) {

              automaticallyDisableWord(
                card,
                wordEntry
              );

            }


            updateSelectedCount();

          }
        );

      }
    );

}


/* =========================================================
   MEANING VISUAL STATE
   ========================================================= */

function updateMeaningVisualState(
  card,
  checkbox
) {

  const pos =
    checkbox.dataset.pos;


  const position =
    checkbox.dataset.position;


  const blocks =
    card.querySelectorAll(
      ".wiki-meaning-block"
    );


  for (
    const block
    of blocks
  ) {

    if (
      block.dataset.pos ===
        pos &&
      block.dataset.meaningPosition ===
        position
    ) {

      block.classList.toggle(
        "wiki-meaning-not-selected",
        !checkbox.checked
      );


      break;

    }

  }

}


/* =========================================================
   ZERO MEANINGS -> WORD OFF
   ========================================================= */

function automaticallyDisableWord(
  card,
  wordEntry
) {

  const mainCheckbox =
    card.querySelector(
      ".wiki-entry-main-checkbox"
    );


  wordEntry.selected =
    false;


  resetWordSelection(
    card,
    wordEntry
  );


  if (
    mainCheckbox
  ) {

    mainCheckbox.checked =
      false;

  }


  setInternalControlsDisabled(
    card,
    true
  );


  card.classList.add(
    "entry-not-selected"
  );

}


/* =========================================================
   CHECK IF WORD HAS A MEANING
   ========================================================= */

function hasAnySelectedMeaning(
  wordEntry
) {

  return wordEntry.partsOfSpeech.some(
    (pos) =>
      pos.meanings.some(
        (meaning) =>
          meaning.selected
      )
  );

}


/* =========================================================
   NOTES EVENTS
   ========================================================= */

function wireNoteCheckboxes(
  card,
  wordEntry
) {

  card
    .querySelectorAll(
      'input[data-kind="pos-note"]'
    )
    .forEach(
      (checkbox) => {

        checkbox.addEventListener(
          "change",
          () => {

            const pos =
              findPosByName(
                wordEntry,
                checkbox.dataset.pos
              );


            if (!pos) {

              return;

            }


            const index =
              Number(
                checkbox.dataset.index
              );


            if (
              pos.notes[
                index
              ]
            ) {

              pos
                .notes[index]
                .selected =
                  checkbox.checked;

            }

          }
        );

      }
    );

}


/* =========================================================
   FIND POS
   ========================================================= */

function findPosByName(
  wordEntry,
  value
) {

  return wordEntry
    .partsOfSpeech
    .find(
      (pos) =>
        pos.partOfSpeech ===
        value
    );

}


/* =========================================================
   SAVE COUNT
   ========================================================= */

function updateSelectedCount() {

  const count =
    entriesContainer
      .querySelectorAll(
        ".wiki-entry-main-checkbox:checked"
      )
      .length;


  updateSaveButton(
    count
  );

}


function renderSaveButtonContent(
  count,
  saving = false
) {

  saveButton.innerHTML = `

    <span
      class="wiki-save-icon"
      aria-hidden="true"
    >
      <img
        src="../save.png"
        alt=""
      />
    </span>

    <span
      class="wiki-save-divider"
      aria-hidden="true"
    ></span>

    <span
      class="wiki-save-label"
    >
      ${saving ? "Saving" : "Save"}
    </span>

    <span
      class="wiki-save-count"
      aria-label="${count} ${count === 1 ? "word" : "words"}"
    >
      ${count}
    </span>

  `;

}


function updateSaveButton(
  count
) {

  if (
    count <= 0
  ) {

    saveButton.disabled =
      true;

    saveButton.style.display =
      "none";

    saveButton.innerHTML =
      "";

    return;

  }


  saveButton.style.display =
    "inline-flex";

  saveButton.disabled =
    false;


  renderSaveButtonContent(
    count
  );

}


/* =========================================================
   SAVE TO SUPABASE

   ATOMIC SAVE:
   every selected word + every selected meaning is sent in
   one RPC call.

   PostgreSQL executes the RPC in one transaction.
   If any insert fails, NOTHING from this Save is committed.
   ========================================================= */

saveButton.addEventListener(
  "click",
  async () => {

    const selected =
      parsedWords.filter(
        (wordEntry) =>
          wordEntry.selected &&
          hasAnySelectedMeaning(
            wordEntry
          ) &&
          !findExistingWord(
            wordEntry
          )
      );


    if (
      !selected.length
    ) {

      return;

    }


    const payload =
      selected.map(
        buildSelectedPayload
      );


    const rpcPayload =
      payload.map(
        buildAtomicSaveWordPayload
      );


    saveButton.style.display =
      "inline-flex";

    saveButton.disabled =
      true;


    renderSaveButtonContent(
      selected.length,
      true
    );


    try {

      const {
        data,
        error
      } = await supabase
        .rpc(
          "save_turkish_words_batch",
          {
            p_words:
              rpcPayload
          }
        );


      if (error) {

        throw error;

      }


      console.log(
        "Atomic save result:",
        data
      );


      showStatus(
        `${selected.length} ${
          selected.length === 1
            ? "word was"
            : "words were"
        } saved to My Dictionary.`,
        "success"
      );


      existingWords =
        await loadExistingWords(
          currentWord
        );


      renderWords();

    } catch (error) {

      console.error(
        "Atomic save failed:",
        error
      );


      showStatus(
        error?.message ||
        "Nothing was saved because the operation failed.",
        "error"
      );


      updateSelectedCount();

    }

  }
);


/* =========================================================
   ATOMIC RPC PAYLOAD

   This is the exact structure expected by
   public.save_turkish_words_batch(jsonb).
   ========================================================= */

function buildAtomicSaveWordPayload(
  payload
) {

  const selectedForms =
    payload.partsOfSpeech
      .filter(
        (pos) =>
          pos.forms.length > 0
      )
      .map(
        (pos) => ({

          part_of_speech:
            pos.partOfSpeech,

          forms:
            pos.forms

        })
      );


  const selectedNotes =
    payload.partsOfSpeech
      .filter(
        (pos) =>
          pos.notes.length > 0
      )
      .map(
        (pos) => ({

          part_of_speech:
            pos.partOfSpeech,

          notes:
            pos.notes

        })
      );


  const meanings = [];


  for (
    const pos
    of payload.partsOfSpeech
  ) {

    for (
      const meaning
      of pos.meanings
    ) {

      meanings.push({

        part_of_speech:
          pos.partOfSpeech,

        position:
          meaning.position,

        usage_label:
          meaning.usageLabel || null,

        meaning:
          meaning.meaning,

        examples:
          meaning.examples.length
            ? meaning.examples
            : null

      });

    }

  }


  return {

    word:
      normalizeSearchWord(
        payload.word
      ),

    etymology:
      payload.etymology,

    pronunciation:
      payload.pronunciation.length
        ? payload.pronunciation
        : null,

    forms:
      selectedForms.length
        ? selectedForms
        : null,

    notes:
      selectedNotes.length
        ? selectedNotes
        : null,

    /*
      The database column is still named surface_analysis.
      The UI currently presents it as editable "Etymology".
    */

    surface_analysis:
      payload.etymologyText,

    base_word_text:
      payload.baseWordText,

    base_word_id:
      payload.baseWordId,

    alternative_forms:
      payload.alternativeForms.length
        ? payload.alternativeForms
        : null,

    meanings

  };

}


/* =========================================================
   SELECTED SAVE PAYLOAD
   ========================================================= */

function buildSelectedPayload(
  wordEntry
) {

  return {

    word:
      wordEntry.word,

    etymology:
      wordEntry.etymology,

    alternativeForms:
      wordEntry.alternativeForms
        .filter(
          (item) =>
            item.selected
        )
        .map(
          ({
            selected,
            ...item
          }) =>
            item
        ),

    etymologyText:
      wordEntry.etymologySelected &&
      cleanText(
        wordEntry.etymologyText
      )
        ? wordEntry.etymologyText
        : null,

    baseWordText:
      wordEntry.baseWordSelected &&
      cleanText(
        wordEntry.baseWordText
      )
        ? wordEntry.baseWordText
        : null,

    baseWordId:
      wordEntry.baseWordSelected
        ? wordEntry.baseWordId
        : null,

    pronunciation:
      wordEntry.pronunciation
        .filter(
          (item) =>
            item.selected
        )
        .map(
          ({
            selected,
            ...item
          }) =>
            item
        ),

    partsOfSpeech:
      wordEntry.partsOfSpeech
        .map(
          (pos) => ({

            partOfSpeech:
              pos.partOfSpeech,

            forms:
              pos.forms
                .filter(
                  (form) =>
                    form.selected
                )
                .map(
                  ({
                    selected,
                    ...form
                  }) =>
                    form
                ),

            meanings:
              pos.meanings
                .filter(
                  (meaning) =>
                    meaning.selected
                )
                .map(
                  ({
                    selected,
                    ...meaning
                  }) =>
                    meaning
                ),

            notes:
              pos.notes
                .filter(
                  (note) =>
                    note.selected
                )
                .map(
                  ({
                    selected,
                    ...note
                  }) =>
                    note
                )

          })
        )
        .filter(
          (pos) =>
            pos.meanings.length > 0
        )

  };

}


/* =========================================================
   TABLE / FORM TEXT HELPERS
   ========================================================= */

function cleanTableText(
  value
) {

  return String(value || "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

}


function normalizeTableLabel(
  value
) {

  return cleanTableText(
    value
  )
    .replace(
      /^[():,;\s]+/,
      ""
    )
    .replace(
      /[():,;\s]+$/,
      ""
    )
    .trim()
    .toLowerCase();

}


function slugifyFormKey(
  value
) {

  const slug =
    String(value || "")
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        "");


  return slug ||
    "form";

}


function capitalizeFirst(
  value
) {

  const text =
    cleanText(
      value
    );


  if (!text) {

    return "Form";

  }


  return (
    text.charAt(0).toUpperCase() +
    text.slice(1)
  );

}


/* =========================================================
   LOADING
   ========================================================= */

function setLoading(
  loading
) {

  searchButton.disabled =
    loading;

  input.disabled =
    loading;


  searchButton.textContent =
    loading
      ? "Searching..."
      : "Search";

}


/* =========================================================
   RESET
   ========================================================= */

function clearResults() {

  parsedWords = [];
  existingWords = [];


  resultsHeader.hidden =
    true;


  entriesContainer.innerHTML =
    "";


  saveButton.disabled =
    true;

  saveButton.style.display =
    "none";

  saveButton.innerHTML =
    "";


  hideStatus();

}


/* =========================================================
   STATUS
   ========================================================= */

function showStatus(
  message,
  type = ""
) {

  statusBox.textContent =
    message;


  statusBox.className =
    `wiki-status ${type}`;


  statusBox.hidden =
    false;

}


function hideStatus() {

  statusBox.hidden =
    true;

}


/* =========================================================
   TEXT HELPERS
   ========================================================= */

function cleanText(
  value
) {

  return String(value || "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

}


function escapeHtml(
  value
) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );

}


/* =========================================================
   START
   ========================================================= */

requireSession();
