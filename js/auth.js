import { supabase } from "./supabase.js";

const loginForm =
  document.getElementById("loginForm");

const loginButton =
  document.getElementById("loginButton");

const status =
  document.getElementById("status");


async function checkExistingSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();


  if (
    !error &&
    data.session
  ) {

    window.location.href =
      "./pages/dictionary.html";
  }
}


loginForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();


    const email =
      document
        .getElementById("email")
        .value
        .trim();


    const password =
      document
        .getElementById("password")
        .value;


    loginButton.disabled = true;

    status.textContent =
      "Signing in...";

    status.className =
      "status";


    const {
      error
    } =
      await supabase.auth
        .signInWithPassword({
          email,
          password
        });


    loginButton.disabled = false;


    if (error) {

      status.textContent =
        "Invalid email or password.";

      status.className =
        "status error";

      return;
    }


    window.location.href =
      "./pages/dictionary.html";
  }
);


checkExistingSession();
