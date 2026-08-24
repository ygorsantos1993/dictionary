import { supabase } from "../../js/supabase.js";

const userEmail =
  document.getElementById("userEmail");

const logoutButton =
  document.getElementById("logoutButton");


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


requireSession();
