import { supabase } from "../../js/supabase.js";


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


let currentWord = "";

let parsedEntries = [];

let existingEntries = [];


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


backButton.addEventListener(
  "click",
  () => {

    window.location.href =
      "./dictionary.html";

  }
);


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

  return value
    .trim()
    .replace(/\s+/g, " ");

}


async function searchWiktionary(word) {

  setLoading(true);

  clearResults();


  try {

    const url =
      `https://en.wiktionary.org/w/rest.php/v1/page/${encodeURIComponent(word)}/html`;


    const response =
      await fetch(
        url,
        {
          headers: {
            "Accept":
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
        `Wiktionary returned ${response.status}.`
      );

    }


    const data =
      await response.json();


    const html =
      data.html;


    if (!html) {

      throw new Error(
        "Wiktionary returned no HTML."
      );

    }


    currentWord =
      word;


    parsedEntries =
      parseTurkishEntries(
        html,
        word
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

    console.error(error);


    showStatus(
      "Could not load Wiktionary right now.",
      "error"
    );

  } finally {

    setLoading(false);

  }

}


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


  const turkishHeading =
    findHeadingByText(
      doc,
      "H2",
      "Turkish"
    );


  if (!turkishHeading) {

    return [];

  }


  const turkishNodes =
    collectUntilHeadingLevel(
      turkishHeading,
      2
    );


  const pronunciation =
    extractPronunciations(
      turkishNodes
    );


  const hasNumberedEtymologies =
    turkishNodes.some(
      (node) =>
        isHeading(node) &&
        headingText(node)
          .match(
            /^Etymology\s+\d+$/i
          )
    );


  const entries = [];


  if (hasNumberedEtymologies) {

    let etymologyNumber = 0;


    for (
      let i = 0;
      i < turkishNodes.length;
      i += 1
    ) {

      const node =
        turkishNodes[i];


      if (
        isHeading(node) &&
        /^Etymology\s+\d+$/i.test(
          headingText(node)
        )
      ) {

        const match =
          headingText(node)
            .match(
              /(\d+)/
            );


        etymologyNumber =
          match
            ? Number(match[1])
            : etymologyNumber + 1;


        const etymologyNodes =
          collectNodesInsideArrayUntilHeadingLevel(
            turkishNodes,
            i + 1,
            headingLevel(node)
          );


        entries.push(
          ...parsePosEntries(
            etymologyNodes,
            searchedWord,
            etymologyNumber,
            pronunciation
          )
        );

      }

    }

  } else {

    entries.push(
      ...parsePosEntries(
        turkishNodes,
        searchedWord,
        1,
        pronunciation
      )
    );

  }


  return entries;

}


function parsePosEntries(
  nodes,
  searchedWord,
  etymology,
  inheritedPronunciation
) {

  const entries = [];


  for (
    let i = 0;
    i < nodes.length;
    i += 1
  ) {

    const node =
      nodes[i];


    if (!isHeading(node)) {

      continue;

    }


    const pos =
      headingText(node);


    if (!POS_NAMES.has(pos)) {

      continue;

    }


    const sectionNodes =
      collectNodesInsideArrayUntilHeadingLevel(
        nodes,
        i + 1,
        headingLevel(node)
      );


    const entry =
      parsePosSection(
        sectionNodes,
        {
          searchedWord,
          etymology,
          pos,
          inheritedPronunciation
        }
      );


    entries.push(
      entry
    );

  }


  return entries;

}


function parsePosSection(
  nodes,
  {
    searchedWord,
    etymology,
    pos,
    inheritedPronunciation
  }
) {

  const sectionPronunciation =
    extractPronunciations(
      nodes
    );


  const pronunciations =
    sectionPronunciation.length
      ? sectionPronunciation
      : inheritedPronunciation;


  const headwordText =
    extractHeadwordText(
      nodes,
      searchedWord
    );


  const forms =
    pos === "Noun" ||
    pos === "Proper noun"
      ? parseNounHeadwordForms(
          headwordText,
          searchedWord
        )
      : [];


  const meanings =
    extractMeanings(
      nodes
    );


  const notes =
    extractNotes(
      nodes
    );


  return {
    word:
      searchedWord,

    etymology,

    partOfSpeech:
      pos,

    pronunciation:
      pronunciations,

    forms,

    meanings,

    notes,

    selected:
      true
  };

}


function extractHeadwordText(
  nodes,
  searchedWord
) {

  for (const node of nodes) {

    if (
      isHeading(node)
    ) {

      continue;

    }


    if (
      node.nodeType !==
      Node.ELEMENT_NODE
    ) {

      continue;

    }


    const text =
      cleanText(
        node.textContent
      );


    if (
      !text ||
      !text
        .toLocaleLowerCase("tr-TR")
        .startsWith(
          searchedWord
            .toLocaleLowerCase(
              "tr-TR"
            )
        )
    ) {

      continue;

    }


    if (
      text.length <= 250
    ) {

      return text;

    }

  }


  return searchedWord;

}


function parseNounHeadwordForms(
  headwordText,
  searchedWord
) {

  const forms = [];


  if (!headwordText) {

    return forms;

  }


  const parenthesisMatch =
    headwordText.match(
      /\((.+)\)/
    );


  if (!parenthesisMatch) {

    return forms;

  }


  const inside =
    parenthesisMatch[1];


  const formMatchers = [

    {
      label:
        "Accusative",

      key:
        "accusative",

      regex:
        /(?:definite\s+)?accusative\s+([^,;)]+)/i
    },

    {
      label:
        "Plural",

      key:
        "plural",

      regex:
        /plural\s+([^,;)]+)/i
    },

    {
      label:
        "Genitive",

      key:
        "genitive",

      regex:
        /genitive\s+([^,;)]+)/i
    }

  ];


  for (
    const matcher
    of formMatchers
  ) {

    const match =
      inside.match(
        matcher.regex
      );


    if (!match) {

      continue;

    }


    const value =
      cleanFormValue(
        match[1]
      );


    if (
      !value ||
      value === searchedWord
    ) {

      continue;

    }


    forms.push({
      key:
        matcher.key,

      label:
        matcher.label,

      value,

      selected:
        true
    });

  }


  return forms;

}


function cleanFormValue(value) {

  return value
    .replace(
      /\[[^\]]+\]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


function extractPronunciations(
  nodes
) {

  const results = [];

  const seen =
    new Set();


  for (
    let i = 0;
    i < nodes.length;
    i += 1
  ) {

    const node =
      nodes[i];


    if (
      !isHeading(node) ||
      headingText(node) !==
        "Pronunciation"
    ) {

      continue;

    }


    const level =
      headingLevel(node);


    const section =
      collectNodesInsideArrayUntilHeadingLevel(
        nodes,
        i + 1,
        level
      );


    for (
      const sectionNode
      of section
    ) {

      const text =
        cleanText(
          sectionNode.textContent
        );


      if (
        !text ||
        !/IPA/i.test(text)
      ) {

        continue;

      }


      const matches = [
        ...text.matchAll(
          /(?:\/[^/\n]+\/|\[[^\]\n]+\])/g
        )
      ];


      for (
        const match
        of matches
      ) {

        const ipa =
          match[0].trim();


        if (
          seen.has(ipa)
        ) {

          continue;

        }


        seen.add(ipa);


        results.push({
          ipa,
          label:
            extractPronunciationLabel(
              text,
              ipa
            ),
          selected:
            true
        });

      }

    }

  }


  return results;

}


function extractPronunciationLabel(
  text,
  ipa
) {

  const index =
    text.indexOf(ipa);


  if (index <= 0) {

    return null;

  }


  const before =
    text
      .slice(
        0,
        index
      )
      .replace(
        /IPA[^:]*:/gi,
        ""
      )
      .replace(
        /IPA/gi,
        ""
      )
      .trim();


  if (
    !before ||
    before.length > 50
  ) {

    return null;

  }


  return before;

}


function extractMeanings(
  nodes
) {

  const meanings = [];


  for (
    const node
    of nodes
  ) {

    if (
      node.nodeType !==
      Node.ELEMENT_NODE
    ) {

      continue;

    }


    if (
      node.tagName !== "OL"
    ) {

      continue;

    }


    if (
      node.closest(
        "table"
      )
    ) {

      continue;

    }


    const items =
      Array.from(
        node.children
      )
      .filter(
        (child) =>
          child.tagName === "LI"
      );


    for (
      const item
      of items
    ) {

      const definition =
        extractDefinitionText(
          item
        );


      if (!definition) {

        continue;

      }


      meanings.push({
        position:
          meanings.length + 1,

        usageLabel:
          extractUsageLabel(
            definition
          ),

        meaning:
          removeLeadingUsageLabel(
            definition
          ),

        examples:
          extractExamples(
            item
          ),

        selected:
          true
      });

    }


    if (
      meanings.length
    ) {

      break;

    }

  }


  return meanings;

}


function extractDefinitionText(
  item
) {

  const clone =
    item.cloneNode(true);


  clone
    .querySelectorAll(
      "ol, ul, dl, table, figure, style"
    )
    .forEach(
      (child) =>
        child.remove()
    );


  return cleanText(
    clone.textContent
  );

}


function extractUsageLabel(
  definition
) {

  const match =
    definition.match(
      /^\(([^)]+)\)\s*/
    );


  return match
    ? match[1].trim()
    : null;

}


function removeLeadingUsageLabel(
  definition
) {

  return definition
    .replace(
      /^\([^)]+\)\s*/,
      ""
    )
    .trim();

}


function extractExamples(
  item
) {

  const examples = [];

  const seen =
    new Set();


  const candidates =
    item.querySelectorAll(
      "dl dd, ul li"
    );


  for (
    const candidate
    of candidates
  ) {

    const text =
      cleanText(
        candidate.textContent
      );


    if (
      !text ||
      text.length < 3 ||
      seen.has(text)
    ) {

      continue;

    }


    seen.add(text);

    examples.push(
      text
    );


    if (
      examples.length >= 6
    ) {

      break;

    }

  }


  return examples;

}


function extractNotes(
  nodes
) {

  const notes = [];


  for (
    let i = 0;
    i < nodes.length;
    i += 1
  ) {

    const node =
      nodes[i];


    if (!isHeading(node)) {

      continue;

    }


    const sectionName =
      headingText(node);


    const isUsageNotes =
      sectionName ===
      "Usage notes";


    const isDeclension =
      sectionName ===
      "Declension";


    if (
      !isUsageNotes &&
      !isDeclension
    ) {

      continue;

    }


    const section =
      collectNodesInsideArrayUntilHeadingLevel(
        nodes,
        i + 1,
        headingLevel(node)
      );


    for (
      const sectionNode
      of section
    ) {

      if (
        sectionNode.nodeType !==
        Node.ELEMENT_NODE
      ) {

        continue;

      }


      if (
        [
          "TABLE",
          "STYLE",
          "FIGURE"
        ].includes(
          sectionNode.tagName
        )
      ) {

        continue;

      }


      if (
        sectionNode.querySelector &&
        sectionNode.querySelector(
          "table"
        )
      ) {

        continue;

      }


      const text =
        cleanText(
          sectionNode.textContent
        );


      if (
        !text ||
        text.length < 20
      ) {

        continue;

      }


      notes.push({
        section:
          isDeclension
            ? "Declension"
            : "Usage notes",

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
        `${note.section}:${note.text}`;


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


  let newEntries = 0;


  parsedEntries.forEach(
    (entry) => {

      const existing =
        findExistingEntry(
          entry
        );


      if (!existing) {

        newEntries += 1;

      }


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
  );


  updateSaveButton(
    newEntries
  );

}


function findExistingEntry(entry) {

  return existingEntries.find(
    (saved) =>
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


function normalizePos(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      "_"
    );

}


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


  const entryCheckbox =
    card.querySelector(
      ".wiki-entry-main-checkbox"
    );


  entryCheckbox.addEventListener(
    "change",
    () => {

      entry.selected =
        entryCheckbox.checked;

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


  const meanings =
    entry.meanings
      .slice(
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
            <h3>Meanings</h3>

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


function renderVisibleMeanings(
  entry
) {

  if (
    !entry.meanings.length
  ) {

    return "";
  }


  const visible =
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
          visible
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


function renderHiddenDetails(
  entry
) {

  const extraMeanings =
    entry.meanings.slice(
      4
    );


  const examples =
    entry.meanings
      .filter(
        (meaning) =>
          meaning.examples.length
      );


  const hasDetails =
    extraMeanings.length > 0 ||
    examples.length > 0 ||
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
          examples.length
            ? `
              <section class="wiki-entry-section detail-section">

                <h3>
                  Examples
                </h3>

                <div class="wiki-example-list">

                  ${
                    examples
                      .map(
                        (meaning) => `
                          <div class="wiki-example-group">

                            <div class="wiki-example-heading">
                              Meaning ${meaning.position}
                            </div>

                            ${
                              meaning.examples
                                .map(
                                  (example) => `
                                    <div class="wiki-example">
                                      ${escapeHtml(example)}
                                    </div>
                                  `
                                )
                                .join("")
                            }

                          </div>
                        `
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


      button.setAttribute(
        "aria-expanded",
        String(!isOpen)
      );


      content.hidden =
        isOpen;


      button
        .querySelector("span")
        .textContent =
          isOpen
            ? "Show all details"
            : "Hide details";

    }
  );

}


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


            entry
              .pronunciation[index]
              .selected =
                checkbox.checked;

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


            entry
              .forms[index]
              .selected =
                checkbox.checked;

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


            entry
              .notes[index]
              .selected =
                checkbox.checked;

          }
        );

      }
    );

}


function updateSelectedCount() {

  const count =
    parsedEntries.filter(
      (entry) => {

        const exists =
          findExistingEntry(
            entry
          );


        return (
          !exists &&
          entry.selected
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

  if (count <= 0) {

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


/*
  IMPORTANT:
  Deliberately not writing to Supabase yet.

  First we validate that:
  - etymologies are correct
  - POS is correct
  - meanings are correct
  - pronunciation is correct
  - headword forms are correct
  - notes are correct

  After that, this button will save all
  selected NEW entries in one operation.
*/
saveButton.addEventListener(
  "click",
  () => {

    const selected =
      parsedEntries.filter(
        (entry) =>
          entry.selected &&
          !findExistingEntry(entry)
      );


    console.log(
      "Selected new entries:",
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


function showStatus(
  message,
  type
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


function findHeadingByText(
  doc,
  tagName,
  text
) {

  return Array
    .from(
      doc.querySelectorAll(
        tagName
      )
    )
    .find(
      (heading) =>
        headingText(heading) ===
        text
    );

}


function headingText(node) {

  const clone =
    node.cloneNode(true);


  clone
    .querySelectorAll(
      ".mw-editsection, .mw-editsection-bracket"
    )
    .forEach(
      (item) =>
        item.remove()
    );


  return cleanText(
    clone.textContent
  );

}


function isHeading(node) {

  return (
    node &&
    node.nodeType ===
      Node.ELEMENT_NODE &&
    /^H[1-6]$/.test(
      node.tagName
    )
  );

}


function headingLevel(node) {

  return Number(
    node.tagName.slice(1)
  );

}


function collectUntilHeadingLevel(
  heading,
  stopLevel
) {

  const nodes = [];


  let current =
    heading.nextElementSibling;


  while (current) {

    if (
      isHeading(current) &&
      headingLevel(current) <=
        stopLevel
    ) {

      break;

    }


    nodes.push(
      current
    );


    current =
      current.nextElementSibling;

  }


  return nodes;

}


function collectNodesInsideArrayUntilHeadingLevel(
  nodes,
  startIndex,
  stopLevel
) {

  const result = [];


  for (
    let i = startIndex;
    i < nodes.length;
    i += 1
  ) {

    const node =
      nodes[i];


    if (
      isHeading(node) &&
      headingLevel(node) <=
        stopLevel
    ) {

      break;

    }


    result.push(
      node
    );

  }


  return result;

}


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


requireSession();
