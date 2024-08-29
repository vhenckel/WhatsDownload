async function setupExtraction() {
  const res = await new Promise((resolve) =>
    chrome.storage.local.get(["contacts", "groupName"], (result) =>
      resolve(result)
    )
  );
  const groupNotFoundElement = document.getElementById("groupNotFound");
  const groupFoundElement = document.getElementById("groupFound");
  if (res?.groupName) {
    groupNotFoundElement.style.display = "none";
    groupFoundElement.style.display = "block";
    const groupNameElement = document.getElementById("groupName");
    groupNameElement.innerHTML = res.groupName;
    const numberOfContactsElement = document.getElementById("numberOfContacts");
    numberOfContactsElement.innerHTML = res.contacts.length;
    db.get(
      {
        format: false,
        numberFormat: false,
      },
      function (items) {
        document.getElementById(items.format).checked = true;
        document.getElementById(items.numberFormat).checked = true;
      }
    );
  } else {
    groupNotFoundElement.style.display = "block";
    groupFoundElement.style.display = "none";
  }
}
setTimeout(setupExtraction, 1);
const db = chrome.storage.local;
chrome.storage.onChanged.addListener(setupExtraction);

document.getElementById("export").addEventListener("click", exportContacts);

function exportContacts() {
  const documentFormatDom = document.getElementsByName("format");
  const numbersFormatDom = document.getElementsByName("numberFormat");

  const documentFormat = [...documentFormatDom];
  const numbersFormat = [...numbersFormatDom];

  const format = documentFormat.filter((item) => item.checked)[0].value;
  const numberFormat = numbersFormat.filter((item) => item.checked)[0].value;
  db.set({
    format,
    numberFormat,
  });
  let mimeType = "text/plain";
  if (format === "csv") {
    mimeType = "text/csv";
  } else if (format === "xls") {
    mimeType = "application/vnd.ms-excel";
  }

  chrome.storage.local.get(["contacts", "groupName"], (result) => {
    const contacts = result.contacts;
    const groupName = result.groupName;
    let documentCSV = `First Name; Phone
  `;
    let count = 1;
    const cleanContacts = handleContacts(contacts, numberFormat);

    for (const item of cleanContacts) {
      documentCSV += `Contact ${count++}; ${item}
  `;
    }

    const blob = new Blob([documentCSV], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${groupName}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    chrome.storage.local.set({ contacts: null, groupName: null });
  });
}

function handleContacts(contacts, format) {
  let cleanedContacts = [];
  if (format === "format1") {
    cleanedContacts = [...contacts];
  } else if (format === "format2") {
    for (const item of contacts) {
      const cleanedItem = `+${item.replace(/[^\d]+/g, "")}`;
      cleanedContacts.push(cleanedItem);
    }
  } else if (format === "format3") {
    for (const item of contacts) {
      const [, ...rest] = item.split(" ");
      const clean = rest.join(" ");
      cleanedContacts.push(clean);
    }
  } else if (format === "format4") {
    for (const item of contacts) {
      const [, ...cleanedItem] = item.split(" ");
      const joined = cleanedItem.join("");
      const phone = joined.replace(/[^\d]+/g, "");
      cleanedContacts.push(phone);
    }
  }
  return cleanedContacts;
}
