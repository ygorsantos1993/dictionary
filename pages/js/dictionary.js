import { supabase } from "../../js/supabase.js";

const userEmail =
  document.getElementById("userEmail");

const logoutButton =
  document.getElementById("logoutButton");

const languageButton =
  document.getElementById("languageButton");

const languageMenu =
  document.getElementById("languageMenu");

const currentLanguageFlag =
  document.getElementById("currentLanguageFlag");

const languageOptions =
  document.querySelectorAll(".language-option");


const languages = {
  chinese: {
    name: "Chinese",
    flag: "../chinese-flag.png"
  },

  arabic_msa: {
    name: "Modern Standard Arabic",
    flag: "../arabic-flag.png"
  },

  turkish: {
    name: "Turkish",
    flag: "../turkish-flag.png"
  }
};


let storedLanguage =
  localStorage.getItem("dictionary_language");


if (storedLanguage === "arabic") {
  storedLanguage = "arabic_msa";

  localStorage.setItem(
    "dictionary_language",
    "arabic_msa"
  );
}


let currentLanguage =
  languages[storedLanguage]
    ? storedLanguage
    : "chinese";


function updateLanguageUI() {
  const language =
    languages[currentLanguage];

  if (!language) {
    return;
  }

  currentLanguageFlag.src =
    language.flag;

  currentLanguageFlag.alt =
    language.name;
}


function setLanguage(languageKey) {
  if (!languages[languageKey]) {
    return;
  }

  currentLanguage =
    languageKey;

  localStorage.setItem(
    "dictionary_language",
    languageKey
  );

  updateLanguageUI();

  closeLanguageMenu();
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

  if (userEmail) {
    userEmail.textContent =
      data.session.user.email;
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
