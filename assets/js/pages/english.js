import { supabase } from "../core/supabase.js";


const backButton =
  document.getElementById(
    "englishBackButton"
  );

const languageButton =
  document.getElementById(
    "languageButton"
  );

const languageMenu =
  document.getElementById(
    "languageMenu"
  );

const languageOptions =
  document.querySelectorAll(
    ".language-option"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );

const searchForm =
  document.getElementById(
    "englishSearchForm"
  );

const searchInput =
  document.getElementById(
    "englishSearchInput"
  );

const searchStatus =
  document.getElementById(
    "englishSearchStatus"
  );


function openLanguageMenu() {

  languageMenu.hidden =
    false;

  languageButton.setAttribute(
    "aria-expanded",
    "true"
  );

}


function closeLanguageMenu() {

  languageMenu.hidden =
    true;

  languageButton.setAttribute(
    "aria-expanded",
    "false"
  );

}


function toggleLanguageMenu() {

  if (
    languageMenu.hidden
  ) {

    openLanguageMenu();

  } else {

    closeLanguageMenu();

  }

}


function goToLanguage(
  languageKey
) {

  if (
    languageKey === "english"
  ) {

    closeLanguageMenu();

    return;

  }


  localStorage.setItem(
    "dictionary_language",
    languageKey
  );


  window.location.href =
    "./dictionary.html";

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

  }

}


backButton.addEventListener(
  "click",
  () => {

    window.location.href =
      "./dictionary.html";

  }
);


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

        goToLanguage(
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
      !languageMenu.contains(
        event.target
      ) &&
      !languageButton.contains(
        event.target
      )
    ) {

      closeLanguageMenu();

    }

  }
);


document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape"
    ) {

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


searchForm.addEventListener(
  "submit",
  (event) => {

    event.preventDefault();


    const word =
      searchInput.value.trim();


    if (!word) {

      searchStatus.textContent =
        "Enter an English word.";

      searchStatus.hidden =
        false;

      return;

    }


    /*
      English → Turkish / Standard Arabic / Chinese
      search will be implemented in the next step.
    */

    searchStatus.textContent =
      "English search will be added next.";

    searchStatus.hidden =
      false;

  }
);


requireSession();
