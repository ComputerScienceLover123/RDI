/** Whole years between DOB and a reference instant (e.g. sale time). */
export function ageAtInstant(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
