function calculateAgeInMonths(dateOfBirth, referenceDate = new Date()) {
  const dob = new Date(dateOfBirth);
  const ref = new Date(referenceDate);

  let months = (ref.getFullYear() - dob.getFullYear()) * 12;
  months += ref.getMonth() - dob.getMonth();

  if (ref.getDate() < dob.getDate()) {
    months -= 1;
  }

  return Math.max(months, 0);
}

function getAgeWarning(ageInMonths) {
  if (ageInMonths < 12 || ageInMonths > 36) {
    return 'This profile is outside the recommended 12-36 month screening band. You can continue, but insights may be less accurate for this age.';
  }
  return null;
}

module.exports = {
  calculateAgeInMonths,
  getAgeWarning
};
