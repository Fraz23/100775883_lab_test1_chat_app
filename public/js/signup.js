$("#signup-form").on("submit", async function (event) {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(this));
  const alertBox = $("#signup-alert");
  alertBox.addClass("d-none");

  try {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Signup failed");
    }

    alertBox
      .removeClass("d-none alert-danger")
      .addClass("alert alert-success")
      .text("Signup successful. Redirecting to login...");

    setTimeout(() => {
      window.location.href = "/login";
    }, 1000);
  } catch (err) {
    alertBox
      .removeClass("d-none alert-success")
      .addClass("alert alert-danger")
      .text(err.message);
  }
});
