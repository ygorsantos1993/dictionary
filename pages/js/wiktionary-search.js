import { supabase } from "../../js/supabase.js";


/* =========================================================
   ELEMENTS
   ========================================================= */

const form =
  document.getElementById(
    "wiktionarySearchForm"
  );

const input =
  document.getElementById(
    "wiktionarySearchInput"
  );

const searchButton =
  document.getElementById(
    "wiktionarySearchButton"
  );

const backButton =
  document.getElementById(
    "backButton"
  );

const saveButton =
  document.getElementById(
    "saveButton"
  );

const statusBox =
  document.getElementById(
    "wikiStatus"
  );

const resultsHeader =
  document.getElementById(
    "wikiResultsHeader"
  );

const wordTitle =
  document.getElementById(
    "wikiWordTitle"
  );

const entryCount =
  document.getElementById(
    "wikiEntryCount"
  );

const entriesContainer =
  document.getElementById(
    "wikiEntries"
  );


/* =========================================================
   STATE
   ========================================================= */

let currentWord = "";

let parsedEntries = [];

let existingEntries = [];


/*
  For now the interface is prepared for several POS,
  but Noun is our first fully supported Turkish entry.
*/
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


    await searchWiktionary(
      word
    );

  }
);


function normalizeSearchWord(value) {

  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");

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


    if (response.status === 404) {

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


    parsedEntries =
      parseTurkishEntries(
        data.html,
        word
      );


    console.log(
      "Parsed Turkish entries:",
      parsedEntries
    );


    if (
      parsedEntries.length === 0
    ) {

      showStatus(
        `No Turkish entry found for “${word}”.`,
        "empty"
      );

      return;

    }


    existingEntries =
      await loadExistingEntries(
        word
      );


    renderEntries();

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
   ========================================================= */

async function loadExistingEntries(word) {

  const {
    data,
    error
  } = await supabase
    .from("turkish_words")
    .select(
      `
        id,
        word,
        etymology,
        part_of_speech
      `
    )
    .eq(
      "word",
      word
    );


  if (error) {

    console.error(
      "Could not check saved entries:",
      error
    );

    return [];

  }


  return data || [];

}


/* =========================================================
   MAIN WIKTIONARY PARSER
   ========================================================= */

function parseTurkishEntries(
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


  /*
    REAL WIKTIONARY STRUCTURE:

    <section>
      <h2 id="Turkish">Turkish</h2>

      <section>
        <h3>Etymology</h3>
      </section>

      <section>
        <h3>Pronunciation</h3>
      </section>

      <section>
        <h3>Noun</h3>
        ...
      </section>
    </section>
  */

  const turkishHeading =
    Array.from(
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
    First check whether the Turkish entry has:

      Etymology 1
      Etymology 2
      Etymology 3

    Those sections normally contain their own POS subsections.
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


  const entries = [];


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


      entries.push(
        ...parseEtymologyContainer(
          etymologySection,
          searchedWord,
          etymologyNumber
        )
      );

    }


    return entries;

  }


  /*
    No numbered etymologies.

    Example: ev

    Turkish
      Etymology
      Pronunciation
      Noun

    Database convention:
      etymology = 1
  */

  entries.push(
    ...parseEtymologyContainer(
      turkishSection,
      searchedWord,
      1
    )
  );


  return entries;

}


/* =========================================================
   ETYMOLOGY CONTAINER
   ========================================================= */

function parseEtymologyContainer(
  container,
  searchedWord,
  etymologyNumber
) {

  const entries = [];


  /*
    Pronunciation can belong to the etymology as a whole,
    rather than being inside the Noun section.
  */

  const pronunciation =
    extractPronunciationsFromContainer(
      container
    );


  const posSections =
    findPosSections(
      container
    );


  for (
    const posSection
    of posSections
  ) {

    const partOfSpeech =
      getSectionTitle(
        posSection
      );


    const entry =
      parsePosSection(
        posSection,
        {
          searchedWord,
          etymologyNumber,
          partOfSpeech,
          inheritedPronunciation:
            pronunciation
        }
      );


    if (entry) {

      entries.push(
        entry
      );

    }

  }


  return entries;

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
   PARSE POS
   ========================================================= */

function parsePosSection(
  posSection,
  {
    searchedWord,
    etymologyNumber,
    partOfSpeech,
    inheritedPronunciation
  }
) {

  const localPronunciation =
    extractPronunciationsFromContainer(
      posSection
    );


  const pronunciation =
    localPronunciation.length > 0
      ? localPronunciation
      : inheritedPronunciation;


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
    extractNotes(
      posSection
    );


  return {

    word:
      searchedWord,

    etymology:
      etymologyNumber,

    partOfSpeech,

    pronunciation,

    forms,

    meanings,

    notes,

    selected:
      true

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

  /*
    We need only the heading that belongs directly
    to this section.

    querySelector("h3") alone could accidentally
    pick a heading from a nested child section.
  */

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
   PRONUNCIATION
   ========================================================= */

function extractPronunciationsFromContainer(
  container
) {

  const pronunciationSections =
    getAllSections(
      container
    )
    .filter(
      (section) =>
        getSectionTitle(section) ===
        "Pronunciation"
    );


  /*
    container itself might already be
    the Pronunciation section.
  */

  if (
    getSectionTitle(container) ===
    "Pronunciation"
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

    /*
      Actual Wiktionary HTML:

      <span class="IPA nowrap">/ˈev/</span>
    */

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


      /*
        We only want actual IPA values,
        not the link whose text is "IPA".
      */

      if (
        !(
          ipa.startsWith("/") ||
          ipa.startsWith("[")
        )
      ) {

        continue;

      }


      if (
        seen.has(ipa)
      ) {

        continue;

      }


      seen.add(ipa);


      const label =
        extractPronunciationQualifier(
          element
        );


      results.push({

        ipa,

        label,

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
    ipaElement.closest("li");


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


  /*
    Actual Wiktionary:

    ev
    (definite accusative evi, plural evler)

    We first try to read the DOM structurally.
  */

  if (headwordElement) {

    const boldForms =
      Array.from(
        headwordElement.querySelectorAll(
          "b"
        )
      );


    for (
      const bold
      of boldForms
    ) {

      const value =
        cleanText(
          bold.textContent
        );


      if (
        !value ||
        value === searchedWord
      ) {

        continue;

      }


      const previousText =
        getTextBeforeElement(
          bold
        )
        .toLowerCase();


      if (
        previousText.includes(
          "accusative"
        )
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
        previousText.includes(
          "plural"
        )
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
        previousText.includes(
          "genitive"
        )
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
    Fallback parser in case Wiktionary changes
    part of the headword markup.
  */

  const text =
    cleanText(
      headwordText
    );


  const regexDefinitions = [

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
    of regexDefinitions
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


  return forms.map(
    (form) => ({
      ...form,
      selected:
        true
    })
  );

}


function getTextBeforeElement(element) {

  const parent =
    element.parentElement;


  if (!parent) {

    return "";

  }


  let text = "";


  for (
    const node
    of parent.childNodes
  ) {

    if (
      node === element
    ) {

      break;

    }


    text +=
      node.textContent || "";

  }


  /*
    Only the last part matters.
  */

  return cleanText(
    text.slice(-80)
  );

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

  /*
    Actual structure:

    <section>
      <h3>Noun</h3>

      <p class/headword...></p>

      <ol>
        <li>meaning</li>
        <li>meaning</li>
      </ol>

      <section>
        <h4>Declension</h4>
      </section>
    </section>

    We want the OL that belongs directly
    to the Noun section.
  */

  let meaningsList = null;


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
    Array.from(
      meaningsList.children
    )
    .filter(
      (element) =>
        element.tagName === "LI"
    );


  const meanings = [];


  meaningItems.forEach(
    (item, index) => {

      const usageLabel =
        extractMeaningUsageLabel(
          item
        );


      const meaning =
        extractMeaningText(
          item
        );


      if (!meaning) {

        return;

      }


      meanings.push({

        position:
          index + 1,

        usageLabel,

        meaning,

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

  /*
    Real Wiktionary:

    <span class="usage-label-sense">
      (architecture)
    </span>
  */

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
    item.cloneNode(true);


  /*
    Remove examples, synonyms and other nested material.
  */

  clone
    .querySelectorAll(
      "dl, ul, ol, table, figure, style, sup.mw-ref"
    )
    .forEach(
      (element) =>
        element.remove()
    );


  /*
    We'll save usage_label separately,
    so remove it from meaning text.
  */

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


  /*
    Wiktionary usage examples are specifically marked
    with classes like:

      h-usage-example
      h-usage-example collocation

    This avoids accidentally saving Synonym blocks
    as examples.
  */

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
        ? cleanText(
            sourceElement.textContent
          )
        : null;


    const translation =
      translationElement
        ? cleanText(
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
      seen.has(key)
    ) {

      continue;

    }


    seen.add(key);


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
   NOTES
   ========================================================= */

function extractNotes(
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


    /*
      We only want prose notes.

      Do NOT save the giant declension table here.
    */

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


      /*
        A DIV containing a declension table
        must also be ignored.
      */

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

        text,

        selected:
          true

      });

    }

  }


  return dedupeNotes(
    notes
  );

}


function dedupeNotes(notes) {

  const seen =
    new Set();


  return notes.filter(
    (note) => {

      const key =
        `${note.section}|${note.text}`;


      if (
        seen.has(key)
      ) {

        return false;

      }


      seen.add(key);

      return true;

    }
  );

}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderEntries() {

  hideStatus();


  resultsHeader.hidden =
    false;


  wordTitle.textContent =
    currentWord;


  entryCount.textContent =
    `${parsedEntries.length} lexical ${
      parsedEntries.length === 1
        ? "entry"
        : "entries"
    } found`;


  entriesContainer.innerHTML =
    "";


  for (
    const entry
    of parsedEntries
  ) {

    const existing =
      findExistingEntry(
        entry
      );


    const card =
      existing
        ? renderExistingCard(
            entry,
            existing
          )
        : renderNewCard(
            entry
          );


    entriesContainer.appendChild(
      card
    );

  }


  updateSelectedCount();

}


/* =========================================================
   FIND SAVED ENTRY
   ========================================================= */

function findExistingEntry(entry) {

  return existingEntries.find(
    (saved) => {

      return (
        Number(saved.etymology) ===
          Number(entry.etymology) &&
        normalizePos(
          saved.part_of_speech
        ) ===
          normalizePos(
            entry.partOfSpeech
          )
      );

    }
  );

}


function normalizePos(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[\s_-]+/g,
      ""
    );

}


/* =========================================================
   NEW ENTRY CARD
   ========================================================= */

function renderNewCard(entry) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "wiki-entry-card wiki-entry-new";


  card.innerHTML = `
    <div class="wiki-entry-top">

      <div>

        <div class="wiki-etymology">
          Etymology ${entry.etymology}
        </div>

        <div class="wiki-pos">
          ${escapeHtml(entry.partOfSpeech)}
        </div>

      </div>


      <label class="wiki-entry-select">

        <input
          type="checkbox"
          class="wiki-entry-main-checkbox"
          checked
        />

        <span></span>

      </label>

    </div>


    <div class="wiki-entry-status new">
      Not in My Dictionary
    </div>


    ${renderPronunciation(entry)}

    ${renderForms(entry)}

    ${renderVisibleMeanings(entry)}

    ${renderHiddenDetails(entry)}
  `;


  const mainCheckbox =
    card.querySelector(
      ".wiki-entry-main-checkbox"
    );


  mainCheckbox.addEventListener(
    "change",
    () => {

      entry.selected =
        mainCheckbox.checked;


      card.classList.toggle(
        "entry-not-selected",
        !entry.selected
      );


      updateSelectedCount();

    }
  );


  wireDetailToggle(
    card
  );


  wireItemCheckboxes(
    card,
    entry
  );


  return card;

}


/* =========================================================
   EXISTING ENTRY CARD
   ========================================================= */

function renderExistingCard(
  entry,
  existing
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "wiki-entry-card wiki-entry-existing";


  /*
    Existing entries stay compact.

    User decided:
      show only enough meanings
      to identify what this entry is.
  */

  const meanings =
    entry.meanings.slice(
      0,
      4
    );


  card.innerHTML = `
    <div class="wiki-entry-top compact">

      <div>

        <div class="wiki-etymology">
          Etymology ${entry.etymology}
        </div>

        <div class="wiki-pos">
          ${escapeHtml(entry.partOfSpeech)}
        </div>

      </div>


      <div class="wiki-saved-mark">
        ✓
      </div>

    </div>


    <div class="wiki-entry-status saved">
      Already in My Dictionary · ID ${existing.id}
    </div>


    ${
      meanings.length
        ? `
          <section class="wiki-entry-section existing-meanings">

            <h3>
              Meanings
            </h3>

            <ol class="wiki-existing-meaning-list">

              ${
                meanings
                  .map(
                    (meaning) => `
                      <li>
                        ${escapeHtml(meaning.meaning)}
                      </li>
                    `
                  )
                  .join("")
              }

            </ol>

          </section>
        `
        : ""
    }


    <button
      class="wiki-library-placeholder"
      type="button"
      disabled
    >
      View in Library
    </button>
  `;


  return card;

}


/* =========================================================
   PRONUNCIATION UI
   ========================================================= */

function renderPronunciation(entry) {

  if (
    !entry.pronunciation.length
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
          entry.pronunciation
            .map(
              (
                pronunciation,
                index
              ) => `
                <label class="wiki-choice-row">

                  <input
                    type="checkbox"
                    data-kind="pronunciation"
                    data-index="${index}"
                    ${
                      pronunciation.selected
                        ? "checked"
                        : ""
                    }
                  />

                  <span class="wiki-custom-check"></span>


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
   FORMS UI
   ========================================================= */

function renderForms(entry) {

  if (
    !entry.forms.length
  ) {

    return "";

  }


  return `
    <section class="wiki-entry-section">

      <h3>
        Forms
      </h3>

      <div class="wiki-form-grid">

        ${
          entry.forms
            .map(
              (
                form,
                index
              ) => `
                <label class="wiki-form-chip">

                  <input
                    type="checkbox"
                    data-kind="form"
                    data-index="${index}"
                    ${
                      form.selected
                        ? "checked"
                        : ""
                    }
                  />

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

    </section>
  `;

}


/* =========================================================
   VISIBLE MEANINGS
   ========================================================= */

function renderVisibleMeanings(entry) {

  if (
    !entry.meanings.length
  ) {

    return "";

  }


  /*
    Decision:
      maximum 4 meanings visible.
  */

  const visibleMeanings =
    entry.meanings.slice(
      0,
      4
    );


  return `
    <section class="wiki-entry-section">

      <h3>
        Meanings
      </h3>

      <div class="wiki-meaning-list">

        ${
          visibleMeanings
            .map(
              (meaning) =>
                renderMeaningRow(
                  meaning
                )
            )
            .join("")
        }

      </div>

    </section>
  `;

}


/* =========================================================
   MEANING ROW
   ========================================================= */

function renderMeaningRow(
  meaning
) {

  return `
    <label class="wiki-meaning-row">

      <input
        type="checkbox"
        data-kind="meaning"
        data-position="${meaning.position}"
        ${
          meaning.selected
            ? "checked"
            : ""
        }
      />

      <span class="wiki-custom-check"></span>


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
   SHOW ALL DETAILS
   ========================================================= */

function renderHiddenDetails(entry) {

  const extraMeanings =
    entry.meanings.slice(
      4
    );


  const meaningsWithExamples =
    entry.meanings.filter(
      (meaning) =>
        Array.isArray(
          meaning.examples
        ) &&
        meaning.examples.length > 0
    );


  /*
    Decision:

    Show all details appears only if:
      - there are more than 4 meanings
      - examples exist
      - notes exist
  */

  const hasDetails =
    extraMeanings.length > 0 ||
    meaningsWithExamples.length > 0 ||
    entry.notes.length > 0;


  if (!hasDetails) {

    return "";

  }


  return `
    <div class="wiki-details-wrap">

      <button
        class="wiki-details-toggle"
        type="button"
        aria-expanded="false"
      >

        <span>
          Show all details
        </span>

        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

      </button>


      <div
        class="wiki-details-content"
        hidden
      >

        ${
          extraMeanings.length
            ? `
              <section class="wiki-entry-section detail-section">

                <h3>
                  More meanings
                </h3>

                <div class="wiki-meaning-list">

                  ${
                    extraMeanings
                      .map(
                        (meaning) =>
                          renderMeaningRow(
                            meaning
                          )
                      )
                      .join("")
                  }

                </div>

              </section>
            `
            : ""
        }


        ${
          meaningsWithExamples.length
            ? `
              <section class="wiki-entry-section detail-section">

                <h3>
                  Examples
                </h3>

                <div class="wiki-example-list">

                  ${
                    meaningsWithExamples
                      .map(
                        (meaning) =>
                          renderExampleGroup(
                            meaning
                          )
                      )
                      .join("")
                  }

                </div>

              </section>
            `
            : ""
        }


        ${
          entry.notes.length
            ? `
              <section class="wiki-entry-section detail-section">

                <h3>
                  Notes
                </h3>

                <div class="wiki-note-list">

                  ${
                    entry.notes
                      .map(
                        (
                          note,
                          index
                        ) => `
                          <label class="wiki-note">

                            <input
                              type="checkbox"
                              data-kind="note"
                              data-index="${index}"
                              ${
                                note.selected
                                  ? "checked"
                                  : ""
                              }
                            />

                            <span class="wiki-custom-check"></span>


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
            `
            : ""
        }

      </div>

    </div>
  `;

}


/* =========================================================
   EXAMPLE UI
   ========================================================= */

function renderExampleGroup(
  meaning
) {

  return `
    <div class="wiki-example-group">

      <div class="wiki-example-heading">
        Meaning ${meaning.position}
      </div>

      ${
        meaning.examples
          .map(
            (example) => {

              if (
                typeof example ===
                "string"
              ) {

                return `
                  <div class="wiki-example">
                    ${escapeHtml(example)}
                  </div>
                `;

              }


              return `
                <div class="wiki-example">

                  ${
                    example.text
                      ? `
                        <div>
                          ${escapeHtml(example.text)}
                        </div>
                      `
                      : ""
                  }

                  ${
                    example.translation
                      ? `
                        <div>
                          ${escapeHtml(example.translation)}
                        </div>
                      `
                      : ""
                  }

                </div>
              `;

            }
          )
          .join("")
      }

    </div>
  `;

}


/* =========================================================
   DETAIL TOGGLE
   ========================================================= */

function wireDetailToggle(card) {

  const button =
    card.querySelector(
      ".wiki-details-toggle"
    );


  if (!button) {

    return;

  }


  const content =
    card.querySelector(
      ".wiki-details-content"
    );


  button.addEventListener(
    "click",
    () => {

      const isOpen =
        button.getAttribute(
          "aria-expanded"
        ) === "true";


      const nextOpen =
        !isOpen;


      button.setAttribute(
        "aria-expanded",
        String(nextOpen)
      );


      content.hidden =
        !nextOpen;


      const label =
        button.querySelector(
          "span"
        );


      if (label) {

        label.textContent =
          nextOpen
            ? "Hide details"
            : "Show all details";

      }

    }
  );

}


/* =========================================================
   ITEM CHECKBOXES
   ========================================================= */

function wireItemCheckboxes(
  card,
  entry
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
              entry.pronunciation[index]
            ) {

              entry
                .pronunciation[index]
                .selected =
                  checkbox.checked;

            }

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

            const index =
              Number(
                checkbox.dataset.index
              );


            if (
              entry.forms[index]
            ) {

              entry
                .forms[index]
                .selected =
                  checkbox.checked;

            }

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

            const position =
              Number(
                checkbox.dataset.position
              );


            const meaning =
              entry.meanings.find(
                (item) =>
                  item.position ===
                  position
              );


            if (meaning) {

              meaning.selected =
                checkbox.checked;

            }

          }
        );

      }
    );


  card
    .querySelectorAll(
      'input[data-kind="note"]'
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
              entry.notes[index]
            ) {

              entry
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
   SAVE COUNT
   ========================================================= */

function updateSelectedCount() {

  const count =
    parsedEntries.filter(
      (entry) => {

        return (
          entry.selected &&
          !findExistingEntry(entry)
        );

      }
    ).length;


  updateSaveButton(
    count
  );

}


function updateSaveButton(count) {

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
   SAVE
   ========================================================= */

/*
  Still intentionally NOT writing to Supabase.

  This search/parser version must first be validated
  with real words.

  When confirmed, this button will send all selected
  NEW entries together.
*/

saveButton.addEventListener(
  "click",
  () => {

    const selected =
      parsedEntries.filter(
        (entry) => {

          return (
            entry.selected &&
            !findExistingEntry(entry)
          );

        }
      );


    console.log(
      "Entries ready to save:",
      selected
    );


    showStatus(
      `${selected.length} new ${
        selected.length === 1
          ? "entry is"
          : "entries are"
      } ready to save.`,
      "success"
    );

  }
);


/* =========================================================
   LOADING
   ========================================================= */

function setLoading(loading) {

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

  parsedEntries = [];

  existingEntries = [];


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

  return String(
    value || ""
  )
    .replace(
      /\[\d+\]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   START
   ========================================================= */

requireSession();
