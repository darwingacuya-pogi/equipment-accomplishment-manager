
document.addEventListener("DOMContentLoaded", () => {
  // Get the HTML elements
  const form = document.getElementById("equipment-form");
  const dateInput = document.getElementById("date");
  const equipmentInput = document.getElementById("equipment");
  const hmrInput = document.getElementById("hmr");
  const submitButton = document.getElementById("submit-button");
  const formMessage = document.getElementById("form-message");
  const buttonLabel = submitButton.querySelector(".button-label");

  // Set today's date automatically
  const today = new Date();
  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  )
    .toISOString()
    .split("T")[0];

  dateInput.value = localDate;

  // Display status messages
  function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
  }

  // Handle form submission
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Get and validate values
    const date = dateInput.value;
    const equipment = equipmentInput.value.trim();
    const hmr = hmrInput.value;

    if (!date || !equipment || !hmr) {
      showMessage("Please complete all fields.", "error");
      return;
    }

    if (Number(hmr) < 0 || !Number.isFinite(Number(hmr))) {
      showMessage("Please enter a valid HMR reading.", "error");
      return;
    }

    // Disable button while saving
    submitButton.disabled = true;
    buttonLabel.textContent = "Saving...";
    showMessage("Submitting your record...", "loading");

    try {
      // Send data to Google Sheets
      const result = await submitEquipmentRecord({
        date,
        equipment,
        hmr: Number(hmr)
      });

      if (!result || result.success !== true) {
        throw new Error(result?.message || "Unable to save record.");
      }

      // Clear fields only after successful saving
      equipmentInput.value = "";
      hmrInput.value = "";
      dateInput.value = localDate;

      showMessage("Record saved successfully!", "success");

      equipmentInput.focus();

    } catch (error) {
      console.error("Submission error:", error);

      showMessage(
        error.message || "Something went wrong. Please try again.",
        "error"
      );

    } finally {
      // Restore button
      submitButton.disabled = false;
      buttonLabel.textContent = "Submit record";
    }
  });
});
