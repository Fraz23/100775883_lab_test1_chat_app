$("#login-form").on("submit", async function (event) {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(this));
  const alertBox = $("#login-alert");
  const submitBtn = $("#login-btn");
  const originalText = submitBtn.text();
  alertBox.addClass("d-none");
  submitBtn.prop("disabled", true).text("Signing in...");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Login failed");
    }

    localStorage.setItem("chat_user", JSON.stringify(result.user));
    window.location.href = "/chat";
  } catch (err) {
    alertBox
      .removeClass("d-none alert-success")
      .addClass("alert alert-danger")
      .text(err.message);
  } finally {
    submitBtn.prop("disabled", false).text(originalText);
  }
});
