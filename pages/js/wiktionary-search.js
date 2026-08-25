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


  /*
    NUMBERED ETYMOLOGIES
  */

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

          sharedPronunciationSections

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
        searchedWord
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

    surfaceAnalysis:
      extractSurfaceAnalysis(
        group.etymologySection
      ),

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
  searchedWord
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
   WORD FORMATION
   ========================================================= */

function extractSurfaceAnalysis(
  etymologySection
) {

  if (!etymologySection) {

    return null;

  }


  const candidates =
    Array.from(
      etymologySection.querySelectorAll(
        ":scope > p, :scope > div, :scope > ul"
      )
    );


  for (
    const element
    of candidates
  ) {

    const text =
      cleanText(
        element.textContent
      );


    if (!text) {

      continue;

    }


    const markerMatch =
      /By\s+surface\s+analysis\s*,?\s*/i.exec(
        text
      );


    if (!markerMatch) {

      continue;

    }


    const start =
      markerMatch.index +
      markerMatch[0].length;


    let result =
      text
        .slice(
          start
        )
        .trim();


    const sentence =
      result.match(
        /^.*?[.!?](?=\s|$)/
      );


    if (sentence) {

      result =
        sentence[0];

    }


    return ensureTerminalPunctuation(
      result
    );

  }


  return null;

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

   ABSOLUTE RULE:

   1. NEVER GENERATE A FORM.
   2. First read what Wiktionary explicitly puts
      in the headword.
   3. Preserve extra forms too:
      obsolete, rare, alternative, etc.
   4. If Accusative and/or Plural are absent,
      search Wiktionary's own Declension table.
   5. If Wiktionary does not provide it,
      do not add it.
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


  const formElements =
    Array.from(
      headwordLine.querySelectorAll(
        "b, strong"
      )
    );


  for (
    const formElement
    of formElements
  ) {

    const value =
      cleanText(
        formElement.textContent
      );


    if (
      !value ||
      normalizeSearchWord(
        value
      ) ===
        normalizeSearchWord(
          searchedWord
        )
    ) {

      continue;

    }


    const labelElement =
      findPreviousHeadwordLabel(
        formElement
      );


    if (!labelElement) {

      continue;

    }


    const rawLabel =
      cleanText(
        labelElement.textContent
      );


    if (!rawLabel) {

      continue;

    }


    const normalized =
      normalizeFormLabel(
        rawLabel
      );


    addFormIfMissing(
      forms,
      {

        key:
          normalized.key,

        label:
          normalized.label,

        value,

        source:
          "wiktionary_headword",

        selected:
          true

      }
    );

  }


  return forms;

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

   IMPORTANT:
   This only looks elsewhere on Wiktionary.
   It never generates a Turkish form.
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
  patterns
) {

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
              ? `Already in My Dictionary · ID ${existing.id}`
              : "Not in My Dictionary"
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
      wordEntry.surfaceAnalysis
        ? renderSurfaceAnalysis(
            wordEntry.surfaceAnalysis
          )
        : ""
    }


    ${
      renderPronunciation(
        wordEntry,
        existing
      )
    }


    ${
      wordEntry.partsOfSpeech
        .map(
          (pos) =>
            renderPartOfSpeech(
              pos,
              existing
            )
        )
        .join("")
    }


    ${
      existing
        ? `
          <button
            class="wiki-library-placeholder"
            type="button"
            disabled
          >
            View in Library
          </button>
        `
        : ""
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
   WORD FORMATION UI
   ========================================================= */

function renderSurfaceAnalysis(
  surfaceAnalysis
) {

  return `

    <section
      class="wiki-entry-section wiki-surface-analysis"
    >

      <h3>
        Word formation
      </h3>

      <p class="wiki-surface-text">
        ${escapeHtml(surfaceAnalysis)}
      </p>

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
          pos.forms
            .map(
              (
                form,
                index
              ) => `

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

  `;

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


      /*
        WORD OFF:
        freeze all internal controls.

        WORD ON:
        reset every selectable field to checked,
        then unlock the card.
      */

      if (
        wordEntry.selected
      ) {

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
   RESET WORD SELECTION

   Re-checking the main WORD checkbox starts again
   with every selectable field selected.
   ========================================================= */

function resetWordSelection(
  card,
  wordEntry
) {

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


  card.classList.toggle(
    "wiki-content-disabled",
    disabled
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

   ZERO MEANINGS:
   WORD AUTO-OFF + LOCK.

   MARKING A MEANING NEVER AUTO-TURNS WORD ON.
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
    parsedWords.filter(
      (wordEntry) =>
        wordEntry.selected &&
        hasAnySelectedMeaning(
          wordEntry
        ) &&
        !findExistingWord(
          wordEntry
        )
    ).length;


  updateSaveButton(
    count
  );

}


function updateSaveButton(
  count
) {

  if (
    count <= 0
  ) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "Save";

    return;

  }


  saveButton.disabled =
    false;


  saveButton.textContent =
    count === 1
      ? "Save 1"
      : `Save ${count}`;

}


/* =========================================================
   SAVE PREVIEW

   DATABASE WRITE STILL DISABLED.
   ========================================================= */

saveButton.addEventListener(
  "click",
  () => {

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


    const payload =
      selected.map(
        buildSelectedPayload
      );


    console.log(
      "Words ready to save:",
      payload
    );


    showStatus(
      `${payload.length} new ${
        payload.length === 1
          ? "word is"
          : "words are"
      } ready to save.`,
      "success"
    );

  }
);


/* =========================================================
   FUTURE SAVE PAYLOAD
   ========================================================= */

function buildSelectedPayload(
  wordEntry
) {

  return {

    word:
      wordEntry.word,

    etymology:
      wordEntry.etymology,

    surfaceAnalysis:
      wordEntry.surfaceAnalysis,

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

  saveButton.textContent =
    "Save";


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
