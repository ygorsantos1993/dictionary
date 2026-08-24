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

  arabic: {
    name: "Arabic",
    flag: "../arabic-flag.png"
  },

  turkish: {
    name: "Turkish",
    flag: "../turkish-flag.png"
  }
};


let currentLanguage =
  localStorage.getItem("dictionary_language") ||
  "chinese";


function updateLanguageUI() {
  const language =
    languages[currentLanguage];

  if (!language) {
    return;
  }

  if (currentLanguageFlag) {
    currentLanguageFlag.src =
      language.flag;

    currentLanguageFlag.alt =
      language.name;
  }
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

  updateLanguageUI();

  closeLanguageMenu();

  /*
    Depois vamos chamar aqui
    a função que carrega o
    dicionário correspondente.
  */
}


function openLanguageMenu() {
  if (!languageMenu) {
    return;
  }

  languageMenu.hidden = false;

  if (languageButton) {
    languageButton.setAttribute(
      "aria-expanded",
      "true"
    );
  }
}


function closeLanguageMenu() {
  if (!languageMenu) {
    return;
  }

  languageMenu.hidden = true;

  if (languageButton) {
    languageButton.setAttribute(
      "aria-expanded",
      "false"
    );
  }
}


function toggleLanguageMenu() {
  if (!languageMenu) {
    return;
  }

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


if (languageButton) {
  languageButton.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      toggleLanguageMenu();
    }
  );
}


languageOptions.forEach(
  (option) => {
    option.addEventListener(
      "click",
      () => {
        const language =
          option.dataset.language;

        setLanguage(language);
      }
    );
  }
);


document.addEventListener(
  "click",
  (event) => {
    if (
      languageMenu &&
      languageButton &&
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


if (logoutButton) {
  logoutButton.addEventListener(
    "click",
    async () => {
      await supabase.auth.signOut();

      window.location.href =
        "../index.html";
    }
  );
}


updateLanguageUI();

requireSession();
