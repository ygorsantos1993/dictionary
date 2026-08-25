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
            Accept:
              "application/json"
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


    /*
      IMPORTANT:

      parsedWords is now:

      [
        {
          word,
          etymology,
          surfaceAnalysis,
          pronunciation,
          partsOfSpeech: [
            {
              partOfSpeech,
              forms,
              meanings
            }
          ],
          notes,
          selected
        }
      ]

      Therefore:

      ONE ARRAY ITEM = ONE FUTURE turkish_words ROW.
    */

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
      parsedWords.length === 0
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

   NEW DATABASE MODEL:

   ONE turkish_words ROW
   =
   word + etymology

   part_of_speech is no longer part of this lookup.
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
    .select(
      `
        id,
        word,
        etymology
      `
    )
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

   ONE RESULT = ONE ETYMOLOGY
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


  /*
    Numbered etymologies:

    Etymology 1
    Etymology 2
    ...

    We only inspect sections whose own DIRECT heading
    is an etymology heading.
  */

  const numberedEtymologySections =
    getAllSections(
      turkishSection
    )
      .filter(
        (section) => {

          const title =
            getSectionTitle(
              section
            );


          return /^Etymology\s+\d+$/i.test(
            title
          );

        }
      );


  const results = [];


  if (
    numberedEtymologySections.length > 0
  ) {

    for (
      const etymologySection
      of numberedEtymologySections
    ) {

      const title =
        getSectionTitle(
          etymologySection
        );


      const match =
        title.match(
          /(\d+)/
        );


      const etymologyNumber =
        match
          ? Number(match[1])
          : 1;


      const parsedWord =
        parseEtymology(
          etymologySection,
          searchedWord,
          etymologyNumber
        );


      if (parsedWord) {

        results.push(
          parsedWord
        );

      }

    }


    return results;

  }


  /*
    Wiktionary very often has only:

    Etymology

    rather than:

    Etymology 1

    Our database convention remains:
    etymology = 1.
  */

  const unnumberedEtymologySection =
    getAllSections(
      turkishSection
    )
      .find(
        (section) =>
          getSectionTitle(
            section
          ) === "Etymology"
      );


  const container =
    unnumberedEtymologySection ||
    turkishSection;


  const parsedWord =
    parseEtymology(
      container,
      searchedWord,
      1
    );


  if (parsedWord) {

    results.push(
      parsedWord
    );

  }


  return results;

}


/* =========================================================
   PARSE ONE ETYMOLOGY

   THIS IS NOW THE SAVED "WORD".
   ========================================================= */

function parseEtymology(
  etymologySection,
  searchedWord,
  etymologyNumber
) {

  const partsOfSpeech =
    [];


  const posSections =
    findPosSections(
      etymologySection
    );


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


  /*
    Pronunciation belongs to the etymology/word,
    not to a separate database row for each POS.
  */

  const pronunciation =
    extractPronunciations(
      etymologySection
    );


  /*
    Surface analysis belongs to the etymology itself.

    If found, it is mandatory.

    It intentionally has NO "selected" property.
  */

  const surfaceAnalysis =
    extractSurfaceAnalysis(
      etymologySection
    );


  /*
    Notes that describe the complete etymology/word.

    POS-local notes are handled separately below.
  */

  const notes =
    extractEtymologyNotes(
      etymologySection
    );


  /*
    If Wiktionary produced no recognized POS,
    there is nothing lexical for us to import.
  */

  if (
    partsOfSpeech.length === 0
  ) {

    return null;

  }


  return {

    word:
      searchedWord,

    etymology:
      etymologyNumber,

    surfaceAnalysis,

    pronunciation,

    partsOfSpeech,

    notes,

    selected:
      true

  };

}


/* =========================================================
   FIND POS SECTIONS
   ========================================================= */

function findPosSections(container) {

  const result = [];


  for (
    const section
    of getAllSections(container)
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

      result.push(
        section
      );

    }

  }


  return result;

}


/* =========================================================
   PARSE ONE PART OF SPEECH
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


  const headwordText =
    headwordLine
      ? cleanText(
          headwordLine.textContent
        )
      : searchedWord;


  let forms = [];


  if (
    partOfSpeech === "Noun" ||
    partOfSpeech === "Proper noun"
  ) {

    forms =
      parseNounHeadwordForms(
        headwordLine,
        headwordText,
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
   SECTION HELPERS
   ========================================================= */

function getAllSections(container) {

  return Array.from(
    container.querySelectorAll(
      "section"
    )
  );

}


function getSectionTitle(section) {

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
   SURFACE ANALYSIS

   Example:

   By surface analysis,
   öl- (“to die”) + -üm (“deverbal nominal”).

   We deliberately search inside the ETYMOLOGY prose,
   but ignore nested POS sections.

   This field is mandatory whenever found.
   ========================================================= */

function extractSurfaceAnalysis(
  etymologySection
) {

  const textBlocks =
    getDirectEtymologyTextBlocks(
      etymologySection
    );


  for (
    const block
    of textBlocks
  ) {

    const fullText =
      cleanText(
        block.textContent
      );


    if (!fullText) {

      continue;

    }


    const marker =
      "By surface analysis";


    const markerIndex =
      fullText
        .toLowerCase()
        .indexOf(
          marker.toLowerCase()
        );


    if (
      markerIndex === -1
    ) {

      continue;

    }


    let analysisText =
      fullText.slice(
        markerIndex
      );


    /*
      Usually the analysis finishes at the end
      of the sentence.

      We preserve the whole surface-analysis
      sentence rather than the entire huge
      etymology paragraph.
    */

    const sentenceMatch =
      analysisText.match(
        /^By surface analysis\b[\s\S]*?[.!?](?=\s|$)/i
      );


    if (sentenceMatch) {

      analysisText =
        sentenceMatch[0];

    }


    analysisText =
      ensureTerminalPunctuation(
        analysisText
      );


    const components =
      extractSurfaceAnalysisComponents(
        block,
        markerIndex
      );


    return {

      text:
        analysisText,

      components

    };

  }


  return null;

}


/* =========================================================
   SURFACE ANALYSIS COMPONENTS

   Best-effort structured extraction.

   Example:

   Türk + -i (nisba suffix)

   may become:

   [
     {
       form: "Türk",
       meaning: null,
       href: "...",
       linkedWordId: null
     },
     {
       form: "-i",
       meaning: "nisba suffix",
       href: "...",
       linkedWordId: null
     }
   ]

   linkedWordId stays null until a saved base can
   actually be connected in the database.
   ========================================================= */

function extractSurfaceAnalysisComponents(
  block
) {

  const components = [];


  const links =
    Array.from(
      block.querySelectorAll(
        "a"
      )
    );


  let surfaceMarkerFound =
    false;


  for (
    const link
    of links
  ) {

    const text =
      cleanText(
        link.textContent
      );


    if (!text) {

      continue;

    }


    if (
      text.toLowerCase() ===
      "surface analysis"
    ) {

      surfaceMarkerFound =
        true;

      continue;

    }


    if (
      !surfaceMarkerFound
    ) {

      continue;

    }


    /*
      Ignore glossary / external descriptive links.
      We are interested in lexical components.
    */

    const href =
      link.getAttribute(
        "href"
      ) || "";


    if (
      href.includes(
        "Appendix:Glossary"
      )
    ) {

      continue;

    }


    /*
      A lexical component is normally inside an
      italic/mention element in Wiktionary.
    */

    const lexicalContainer =
      link.closest(
        "i, .mention"
      );


    if (!lexicalContainer) {

      continue;

    }


    const form =
      cleanText(
        lexicalContainer.textContent
      );


    if (!form) {

      continue;

    }


    if (
      components.some(
        (component) =>
          component.form ===
          form
      )
    ) {

      continue;

    }


    components.push({

      form,

      meaning:
        extractComponentGloss(
          lexicalContainer
        ),

      href:
        href || null,

      linkedWordId:
        null

    });

  }


  return components;

}


/* =========================================================
   COMPONENT GLOSS

   Attempts to capture nearby:

   (“to die”)
   (nisba suffix)

   without making up information.
   ========================================================= */

function extractComponentGloss(
  lexicalElement
) {

  let current =
    lexicalElement.nextSibling;


  let accumulated =
    "";


  let steps = 0;


  while (
    current &&
    steps < 5
  ) {

    steps += 1;


    if (
      current.nodeType ===
      Node.TEXT_NODE
    ) {

      accumulated +=
        current.textContent || "";

    } else if (
      current.nodeType ===
      Node.ELEMENT_NODE
    ) {

      /*
        Stop when another lexical component begins.
      */

      if (
        current.matches(
          "i, .mention"
        )
      ) {

        break;

      }


      accumulated +=
        current.textContent || "";

    }


    if (
      accumulated.includes("+")
    ) {

      break;

    }


    current =
      current.nextSibling;

  }


  accumulated =
    cleanText(
      accumulated
    );


  const match =
    accumulated.match(
      /\((?:“|")?([^()]+?)(?:”|")?\)/
    );


  if (!match) {

    return null;

  }


  return cleanText(
    match[1]
  ) || null;

}


/* =========================================================
   DIRECT ETYMOLOGY PROSE

   Prevents us from accidentally finding text inside
   Noun / Verb / Adjective sections.
   ========================================================= */

function getDirectEtymologyTextBlocks(
  etymologySection
) {

  const blocks = [];


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
      child.tagName === "SECTION"
    ) {

      continue;

    }


    if (
      [
        "P",
        "DIV",
        "UL",
        "OL"
      ].includes(
        child.tagName
      )
    ) {

      blocks.push(
        child
      );

    }

  }


  return blocks;

}


/* =========================================================
   PRONUNCIATION
   ========================================================= */

function extractPronunciations(
  container
) {

  const pronunciationSections =
    getAllSections(
      container
    )
      .filter(
        (section) =>
          getSectionTitle(
            section
          ) === "Pronunciation"
      );


  if (
    getSectionTitle(
      container
    ) === "Pronunciation"
  ) {

    pronunciationSections.unshift(
      container
    );

  }


  const results = [];

  const seen =
    new Set();


  for (
    const section
    of pronunciationSections
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
        !(
          ipa.startsWith("/") ||
          ipa.startsWith("[")
        )
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


  const text =
    cleanText(
      qualifier.textContent
    );


  return text || null;

}


/* =========================================================
   NOUN HEADWORD FORMS
   ========================================================= */

function parseNounHeadwordForms(
  headwordElement,
  headwordText,
  searchedWord
) {

  const forms = [];


  if (headwordElement) {

    const formElements =
      Array.from(
        headwordElement.querySelectorAll(
          "b"
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
        value === searchedWord
      ) {

        continue;

      }


      const labelElement =
        findPreviousLabelElement(
          formElement
        );


      if (!labelElement) {

        continue;

      }


      const label =
        cleanText(
          labelElement.textContent
        )
          .toLowerCase();


      if (
        label ===
          "definite accusative" ||
        label ===
          "accusative"
      ) {

        addFormIfMissing(
          forms,
          {
            key:
              "accusative",

            label:
              "Accusative",

            value
          }
        );

        continue;

      }


      if (
        label ===
        "plural"
      ) {

        addFormIfMissing(
          forms,
          {
            key:
              "plural",

            label:
              "Plural",

            value
          }
        );

        continue;

      }


      if (
        label ===
        "genitive"
      ) {

        addFormIfMissing(
          forms,
          {
            key:
              "genitive",

            label:
              "Genitive",

            value
          }
        );

      }

    }

  }


  /*
    Fallback only when structural extraction
    found nothing.
  */

  if (
    forms.length === 0
  ) {

    const text =
      cleanText(
        headwordText
      );


    const definitions = [

      {
        key:
          "accusative",

        label:
          "Accusative",

        regex:
          /(?:definite\s+)?accusative\s+([^,;)]+)/i
      },

      {
        key:
          "plural",

        label:
          "Plural",

        regex:
          /plural\s+([^,;)]+)/i
      },

      {
        key:
          "genitive",

        label:
          "Genitive",

        regex:
          /genitive\s+([^,;)]+)/i
      }

    ];


    for (
      const definition
      of definitions
    ) {

      const match =
        text.match(
          definition.regex
        );


      if (!match) {

        continue;

      }


      const value =
        cleanText(
          match[1]
        );


      if (
        !value ||
        value === searchedWord
      ) {

        continue;

      }


      addFormIfMissing(
        forms,
        {
          key:
            definition.key,

          label:
            definition.label,

          value
        }
      );

    }

  }


  return forms.map(
    (item) => ({
      ...item,
      selected:
        true
    })
  );

}


function findPreviousLabelElement(
  element
) {

  let current =
    element.previousSibling;


  while (current) {

    if (
      current.nodeType ===
      Node.ELEMENT_NODE
    ) {

      if (
        current.tagName === "I"
      ) {

        return current;

      }


      return null;

    }


    current =
      current.previousSibling;

  }


  return null;

}


function addFormIfMissing(
  forms,
  form
) {

  const exists =
    forms.some(
      (existing) =>
        existing.key ===
          form.key &&
        existing.value ===
          form.value
    );


  if (!exists) {

    forms.push(
      form
    );

  }

}


/* =========================================================
   MEANINGS
   ========================================================= */

function extractMeanings(
  posSection
) {

  let meaningsList =
    null;


  /*
    Only the direct ordered list of this POS.
    Nested synonym/example lists must not become meanings.
  */

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


  const meaningItems =
    Array
      .from(
        meaningsList.children
      )
      .filter(
        (element) =>
          element.tagName === "LI"
      );


  const meanings = [];


  meaningItems.forEach(
    (item) => {

      const meaningText =
        extractMeaningText(
          item
        );


      if (!meaningText) {

        return;

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
  );


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


  let text =
    cleanText(
      label.textContent
    );


  text =
    text
      .replace(/^\(/, "")
      .replace(/\)$/, "")
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

      translation,

      selected:
        true

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

   Usage notes / declension prose belong to a POS.

   Full declension TABLES are still ignored.
   ========================================================= */

function extractPosNotes(
  posSection
) {

  const notes = [];


  const relevantSections =
    getAllSections(
      posSection
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


/* =========================================================
   ETYMOLOGY NOTES

   Currently intentionally conservative.

   Surface analysis is extracted separately and MUST NOT
   also become a selectable note.
   ========================================================= */

function extractEtymologyNotes() {

  /*
    For now we do not automatically save the whole huge
    etymology paragraph as a note.

    That was exactly the problem we wanted to avoid.

    Later we can add specific deterministic patterns such as:
      Inherited from...
      Borrowed from...
      From Ottoman Turkish...
    if desired.

    Surface analysis is already handled separately.
  */

  return [];

}


/* =========================================================
   NOTES DEDUPE
   ========================================================= */

function dedupeNotes(notes) {

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
   RENDER ALL WORDS
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
    (
      wordEntry,
      index
    ) => {

      const existing =
        findExistingWord(
          wordEntry
        );


      const card =
        renderWordCard(
          wordEntry,
          existing,
          index
        );


      entriesContainer.appendChild(
        card
      );

    }
  );


  updateSelectedCount();

}


/* =========================================================
   EXISTING WORD

   NEW UNIQUE IDENTITY:
   word + etymology
   ========================================================= */

function findExistingWord(
  wordEntry
) {

  return existingWords.find(
    (saved) =>
      Number(
        saved.etymology
      ) ===
      Number(
        wordEntry.etymology
      )
  );

}


/* =========================================================
   COMPLETE WORD CARD

   NO "SHOW MORE DETAILS".

   EVERYTHING IS ALWAYS VISIBLE.
   THE PAGE ITSELF SCROLLS.
   ========================================================= */

function renderWordCard(
  wordEntry,
  existing,
  index
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    existing
      ? "wiki-entry-card wiki-entry-existing"
      : "wiki-entry-card wiki-entry-new";


  /*
    Existing words cannot be selected for saving again.
  */

  if (existing) {

    wordEntry.selected =
      false;

  }


  card.innerHTML = `

    <div class="wiki-entry-top">

      <div>

        <div class="wiki-etymology">
          WORD ${index + 1}
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
        ? `
          <div class="wiki-entry-status saved">
            Already in My Dictionary · ID ${existing.id}
          </div>
        `
        : `
          <div class="wiki-entry-status new">
            Not in My Dictionary
          </div>
        `
    }


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
      renderWordNotes(
        wordEntry,
        existing
      )
    }


    ${
      !existing
        ? `
          <button
            type="button"
            class="wiki-toggle-all-button"
          >
            Deselect all
          </button>
        `
        : `
          <button
            class="wiki-library-placeholder"
            type="button"
            disabled
          >
            View in Library
          </button>
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
   SURFACE ANALYSIS UI

   IMPORTANT:
   NO CHECKBOX.
   NOT AFFECTED BY SELECT ALL / DESELECT ALL.
   ========================================================= */

function renderSurfaceAnalysis(
  surfaceAnalysis
) {

  const components =
    Array.isArray(
      surfaceAnalysis.components
    )
      ? surfaceAnalysis.components
      : [];


  return `

    <section
      class="wiki-entry-section wiki-surface-analysis"
    >

      <h3>
        Word formation
      </h3>


      ${
        components.length > 0
          ? `
            <div class="wiki-surface-components">

              ${
                components
                  .map(
                    (
                      component,
                      index
                    ) => `

                      ${
                        index > 0
                          ? `
                            <span class="wiki-surface-plus">
                              +
                            </span>
                          `
                          : ""
                      }


                      <span class="wiki-surface-component">

                        <strong>
                          ${escapeHtml(component.form)}
                        </strong>

                        ${
                          component.meaning
                            ? `
                              <small>
                                ${escapeHtml(component.meaning)}
                              </small>
                            `
                            : ""
                        }

                      </span>

                    `
                  )
                  .join("")
              }

            </div>
          `
          : ""
      }


      <p class="wiki-surface-text">
        ${escapeHtml(surfaceAnalysis.text)}
      </p>


      <div class="wiki-required-data">
        Saved automatically with this word
      </div>

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

    <section class="wiki-entry-section">

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

                        <span class="wiki-custom-check"></span>
                      `
                  }


                  <span class="wiki-choice-content">

                    <strong class="wiki-ipa">
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
   COMPLETE POS SECTION
   ========================================================= */

function renderPartOfSpeech(
  pos,
  existing
) {

  return `

    <section
      class="wiki-entry-section wiki-pos-section"
    >

      <div class="wiki-pos">
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
        renderExamples(
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

    <div class="wiki-pos-subsection">

      <h3>
        Forms
      </h3>


      <div class="wiki-form-grid">

        ${
          pos.forms
            .map(
              (
                form,
                index
              ) => `

                <label class="wiki-form-chip">

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

   ALL MEANINGS ARE SHOWN.
   NO LIMIT OF FOUR ANYMORE.
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

    <div class="wiki-pos-subsection">

      <h3>
        Meanings
      </h3>


      <div class="wiki-meaning-list">

        ${
          pos.meanings
            .map(
              (meaning) =>
                renderMeaningRow(
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


function renderMeaningRow(
  pos,
  meaning,
  existing
) {

  return `

    <label class="wiki-meaning-row">

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

            <span class="wiki-custom-check"></span>
          `
      }


      <span class="wiki-meaning-number">
        ${meaning.position}.
      </span>


      <span class="wiki-meaning-text">

        ${
          meaning.usageLabel
            ? `
              <small class="wiki-usage-label">
                ${escapeHtml(meaning.usageLabel)}
              </small>
            `
            : ""
        }

        ${escapeHtml(meaning.meaning)}

      </span>

    </label>

  `;

}


/* =========================================================
   EXAMPLES UI

   ALL EXAMPLES ARE SHOWN.
   ========================================================= */

function renderExamples(
  pos,
  existing
) {

  const meaningsWithExamples =
    pos.meanings.filter(
      (meaning) =>
        Array.isArray(
          meaning.examples
        ) &&
        meaning.examples.length > 0
    );


  if (
    meaningsWithExamples.length === 0
  ) {

    return "";

  }


  return `

    <div class="wiki-pos-subsection">

      <h3>
        Examples
      </h3>


      <div class="wiki-example-list">

        ${
          meaningsWithExamples
            .map(
              (meaning) =>
                renderExampleGroup(
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


function renderExampleGroup(
  pos,
  meaning,
  existing
) {

  return `

    <div class="wiki-example-group">

      <div class="wiki-example-heading">
        Meaning ${meaning.position}
      </div>


      ${
        meaning.examples
          .map(
            (
              example,
              exampleIndex
            ) => `

              <label
                class="wiki-choice-row wiki-example-choice"
              >

                ${
                  existing
                    ? ""
                    : `
                      <input
                        type="checkbox"
                        data-kind="example"
                        data-pos="${escapeAttribute(pos.partOfSpeech)}"
                        data-meaning-position="${meaning.position}"
                        data-example-index="${exampleIndex}"
                        checked
                      />

                      <span class="wiki-custom-check"></span>
                    `
                }


                <span class="wiki-choice-content">

                  ${
                    example.text
                      ? `
                        <strong>
                          ${escapeHtml(example.text)}
                        </strong>
                      `
                      : ""
                  }


                  ${
                    example.translation
                      ? `
                        <small>
                          ${escapeHtml(example.translation)}
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

  `;

}


/* =========================================================
   POS NOTES UI
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

    <div class="wiki-pos-subsection">

      <h3>
        Notes
      </h3>


      <div class="wiki-note-list">

        ${
          pos.notes
            .map(
              (
                note,
                index
              ) => `

                <label class="wiki-note">

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

                        <span class="wiki-custom-check"></span>
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
   WORD-LEVEL NOTES UI
   ========================================================= */

function renderWordNotes(
  wordEntry,
  existing
) {

  if (
    !wordEntry.notes.length
  ) {

    return "";

  }


  return `

    <section class="wiki-entry-section">

      <h3>
        Notes
      </h3>


      <div class="wiki-note-list">

        ${
          wordEntry.notes
            .map(
              (
                note,
                index
              ) => `

                <label class="wiki-note">

                  ${
                    existing
                      ? ""
                      : `
                        <input
                          type="checkbox"
                          data-kind="word-note"
                          data-index="${index}"
                          checked
                        />

                        <span class="wiki-custom-check"></span>
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

    </section>

  `;

}


/* =========================================================
   WIRE ONE NEW WORD CARD
   ========================================================= */

function wireWordCard(
  card,
  wordEntry
) {

  const mainCheckbox =
    card.querySelector(
      ".wiki-entry-main-checkbox"
    );


  if (mainCheckbox) {

    mainCheckbox.addEventListener(
      "change",
      () => {

        wordEntry.selected =
          mainCheckbox.checked;


        card.classList.toggle(
          "entry-not-selected",
          !wordEntry.selected
        );


        updateSelectedCount();

      }
    );

  }


  wireSelectableItems(
    card,
    wordEntry
  );


  wireToggleAll(
    card
  );


  refreshToggleAllButton(
    card
  );

}


/* =========================================================
   SELECTABLE INTERNAL ITEMS

   EXCLUDES:

   - main word checkbox
   - surface analysis

   Surface analysis is mandatory.
   ========================================================= */

function getSelectableItemCheckboxes(
  card
) {

  return Array.from(
    card.querySelectorAll(
      `
        input[data-kind="pronunciation"],
        input[data-kind="form"],
        input[data-kind="meaning"],
        input[data-kind="example"],
        input[data-kind="pos-note"],
        input[data-kind="word-note"]
      `
    )
  );

}


/* =========================================================
   SELECT ALL / DESELECT ALL
   ========================================================= */

function wireToggleAll(
  card
) {

  const button =
    card.querySelector(
      ".wiki-toggle-all-button"
    );


  if (!button) {

    return;

  }


  button.addEventListener(
    "click",
    () => {

      const checkboxes =
        getSelectableItemCheckboxes(
          card
        );


      if (
        checkboxes.length === 0
      ) {

        return;

      }


      const allSelected =
        checkboxes.every(
          (checkbox) =>
            checkbox.checked
        );


      const newValue =
        !allSelected;


      for (
        const checkbox
        of checkboxes
      ) {

        checkbox.checked =
          newValue;


        checkbox.dispatchEvent(
          new Event(
            "change",
            {
              bubbles:
                true
            }
          )
        );

      }


      refreshToggleAllButton(
        card
      );

    }
  );

}


function refreshToggleAllButton(
  card
) {

  const button =
    card.querySelector(
      ".wiki-toggle-all-button"
    );


  if (!button) {

    return;

  }


  const checkboxes =
    getSelectableItemCheckboxes(
      card
    );


  if (
    checkboxes.length === 0
  ) {

    button.hidden =
      true;

    return;

  }


  const allSelected =
    checkboxes.every(
      (checkbox) =>
        checkbox.checked
    );


  button.textContent =
    allSelected
      ? "Deselect all"
      : "Select all";

}


/* =========================================================
   ITEM CHECKBOX EVENTS
   ========================================================= */

function wireSelectableItems(
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
              wordEntry.pronunciation[index]
            ) {

              wordEntry
                .pronunciation[index]
                .selected =
                  checkbox.checked;

            }


            refreshToggleAllButton(
              card
            );

          }
        );

      }
    );


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
              pos.forms[index]
            ) {

              pos
                .forms[index]
                .selected =
                  checkbox.checked;

            }


            refreshToggleAllButton(
              card
            );

          }
        );

      }
    );


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


            refreshToggleAllButton(
              card
            );

          }
        );

      }
    );


  card
    .querySelectorAll(
      'input[data-kind="example"]'
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


            const meaningPosition =
              Number(
                checkbox.dataset
                  .meaningPosition
              );


            const exampleIndex =
              Number(
                checkbox.dataset
                  .exampleIndex
              );


            const meaning =
              pos.meanings.find(
                (item) =>
                  item.position ===
                  meaningPosition
              );


            if (
              meaning &&
              meaning.examples[
                exampleIndex
              ]
            ) {

              meaning
                .examples[
                  exampleIndex
                ]
                .selected =
                  checkbox.checked;

            }


            refreshToggleAllButton(
              card
            );

          }
        );

      }
    );


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
              pos.notes[index]
            ) {

              pos
                .notes[index]
                .selected =
                  checkbox.checked;

            }


            refreshToggleAllButton(
              card
            );

          }
        );

      }
    );


  card
    .querySelectorAll(
      'input[data-kind="word-note"]'
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
              wordEntry.notes[index]
            ) {

              wordEntry
                .notes[index]
                .selected =
                  checkbox.checked;

            }


            refreshToggleAllButton(
              card
            );

          }
        );

      }
    );

}


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

   COUNT WORDS/ETYMOLOGIES,
   NOT PARTS OF SPEECH.
   ========================================================= */

function updateSelectedCount() {

  const count =
    parsedWords.filter(
      (wordEntry) => {

        return (
          wordEntry.selected &&
          !findExistingWord(
            wordEntry
          )
        );

      }
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

   DATABASE WRITE IS STILL DISABLED.

   VERY IMPORTANT:
   This allows us to inspect the NEW object structure
   before wiring the database transaction.
   ========================================================= */

saveButton.addEventListener(
  "click",
  () => {

    const selected =
      parsedWords.filter(
        (wordEntry) => {

          return (
            wordEntry.selected &&
            !findExistingWord(
              wordEntry
            )
          );

        }
      );


    console.log(
      "Words ready to save:",
      selected
    );


    showStatus(
      `${selected.length} new ${
        selected.length === 1
          ? "word is"
          : "words are"
      } ready to save.`,
      "success"
    );

  }
);


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

function cleanText(value) {

  return String(value || "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function escapeAttribute(value) {

  return escapeHtml(
    value
  );

}


/* =========================================================
   START
   ========================================================= */

requireSession();
