import { supabase } from "../../js/supabase.js";


const backButton =
  document.getElementById(
    "englishBackButton"
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
