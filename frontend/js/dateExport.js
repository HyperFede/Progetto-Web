function combineDateTime(isoDate, timeString) {
  const date = new Date(isoDate);
  
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  
  const newDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  
  const formattedDay = String(newDate.getUTCDate()).padStart(2, '0');
  const formattedMonth = String(newDate.getUTCMonth() + 1).padStart(2, '0');
  const formattedYear = newDate.getUTCFullYear();
  const formattedHours = String(newDate.getUTCHours()).padStart(2, '0');
  const formattedMinutes = String(newDate.getUTCMinutes()).padStart(2, '0');
  
  return `${formattedDay}/${formattedMonth}/${formattedYear} ${formattedHours}:${formattedMinutes}`;
}