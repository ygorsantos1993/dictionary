import { supabase } from "../../js/supabase.js";


const logoutButton =
  document.getElementById("logoutButton");

const syncButton =
  document.getElementById("syncButton");

const libraryButton =
  document.getElementById("libraryButton");

const languageButton =
  document.getElementById("languageButton");

const languageMenu =
  document.getElementById("languageMenu");

const currentLanguageFlag =
  document.getElementById("currentLanguageFlag");

const languageOptions =
  document.querySelectorAll(".language-option");

const dictionaryTitle =
  document.getElementById("dictionaryTitle");


const onlineDirection =
  document.getElementById("onlineDirection");

const onlineTargetFlag =
  document.getElementById("onlineTargetFlag");

const onlineSearchInput =
  document.getElementById("onlineSearchInput");

const onlineSearchForm =
  document.getElementById("onlineSearchForm");


const wiktionaryDirection =
  document.getElementById("wiktionaryDirection");

const wiktionarySourceFlag =
  document.getElementById("wiktionarySourceFlag");

const wiktionarySearchInput =
  document.getElementById("wiktionarySearchInput");

const wiktionarySearchForm =
  document.getElementById("wiktionarySearchForm");


const cacheTargetButton =
  document.getElementById("cacheTargetButton");

const cacheEnglishButton =
  document.getElementById("cacheEnglishButton");

const cacheSearchFlag =
  document.getElementById("cacheSearchFlag");

const cacheSearchInput =
  document.getElementById("cacheSearchInput");

const cacheSearchForm =
  document.getElementById("cacheSearchForm");


const languages = {
  turkish: {
    name: "Turkish",
    flag: "../turkish-flag.png"
  },

  msa: {
    name: "Standard Arabic",
    flag: "../arabic-flag.png"
  },

  chinese: {
    name: "Chinese",
    flag: "../chinese-flag.png"
  }
};


let storedLanguage =
  localStorage.getItem(
    "dictionary_language"
  );


if (storedLanguage === "arabic") {
  storedLanguage = "msa";

  localStorage.setItem(
    "dictionary_language",
    "msa"
  );
}


let currentLanguage =
  languages[storedLanguage]
    ? storedLanguage
    : "turkish";


let cacheSearchLanguage =
  "target";


function updateLanguageUI() {
  const language =
    languages[currentLanguage];


  dictionaryTitle.textContent =
    `${language.name} Dictionary`;


  currentLanguageFlag.src =
    language.flag;

  currentLanguageFlag.alt =
    language.name;


  onlineDirection.textContent =
    `English → ${language.name}`;

  onlineTargetFlag.src =
    language.flag;

  onlineTargetFlag.alt =
    language.name;

  onlineSearchInput.placeholder =
    "Type a word in English...";


  wiktionaryDirection.textContent =
    `${language.name} → English`;

  wiktionarySourceFlag.src =
    language.flag;

  wiktionarySourceFlag.alt =
    language.name;

  wiktionarySearchInput.placeholder =
    `Type a ${language.name} word...`;


  cacheTargetButton.textContent =
    language.name;


  updateCacheSearchUI();
}


function updateCacheSearchUI() {
  const language =
    languages[currentLanguage];


  if (cacheSearchLanguage === "target") {

    cacheTargetButton.classList.add(
      "active"
    );

    cacheEnglishButton.classList.remove(
      "active"
    );


    cacheSearchFlag.src =
      language.flag;

    cacheSearchFlag.alt =
      language.name;


    cacheSearchInput.placeholder =
      `Search ${language.name} words...`;

  } else {

    cacheTargetButton.classList.remove(
      "active"
    );

    cacheEnglishButton.classList.add(
      "active"
    );


    cacheSearchFlag.src =
      "../english-flag.png";

    cacheSearchFlag.alt =
      "English";


    cacheSearchInput.placeholder =
      "Search English meanings...";
  }


  cacheSearchInput.value = "";
}


function setLanguage(languageKey) {
  if (!languages[languageKey]) {
    return;
  }


  currentLanguage =
    languageKey;


  localStorage.setItem(
    "dictionary_language",
    currentLanguage
  );


  closeLanguageMenu();

  updateLanguageUI();
}


function openLanguageMenu() {
  languageMenu.hidden = false;

  languageButton.setAttribute(
    "aria-expanded",
    "true"
  );
}


function closeLanguageMenu() {
  languageMenu.hidden = true;

  languageButton.setAttribute(
    "aria-expanded",
    "false"
  );
}


function toggleLanguageMenu() {
  if (languageMenu.hidden) {
    openLanguageMenu();
  } else {
    closeLanguageMenu();
  }
}


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

    return;
  }
}


languageButton.addEventListener(
  "click",
  (event) => {
    event.stopPropagation();

    toggleLanguageMenu();
  }
);


languageOptions.forEach(
  (option) => {
    option.addEventListener(
      "click",
      () => {
        setLanguage(
          option.dataset.language
        );
      }
    );
  }
);


document.addEventListener(
  "click",
  (event) => {
    if (
      !languageMenu.contains(event.target) &&
      !languageButton.contains(event.target)
    ) {
      closeLanguageMenu();
    }
  }
);


document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeLanguageMenu();
    }
  }
);


cacheTargetButton.addEventListener(
  "click",
  () => {
    cacheSearchLanguage =
      "target";

    updateCacheSearchUI();
  }
);


cacheEnglishButton.addEventListener(
  "click",
  () => {
    cacheSearchLanguage =
      "english";

    updateCacheSearchUI();
  }
);


/*
  FUTURE:
  external translation API
  English → selected dictionary language
*/
onlineSearchForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
  }
);


/*
  FUTURE:
  Wiktionary API
  selected dictionary language → English
*/
wiktionarySearchForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
  }
);


/*
  FUTURE:
  IndexedDB search
*/
cacheSearchForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
  }
);


/*
  FUTURE:
  compare Supabase settings
  with local IndexedDB cache.
*/
syncButton.addEventListener(
  "click",
  () => {
  }
);


/*
  FUTURE:
  open library.html
*/
libraryButton.addEventListener(
  "click",
  () => {
  }
);


logoutButton.addEventListener(
  "click",
  async () => {
    await supabase.auth.signOut();

    window.location.href =
      "../index.html";
  }
);


updateLanguageUI();

requireSession();
