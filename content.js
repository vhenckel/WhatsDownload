document.addEventListener(
  "click",
  () => {
    let count = 0;
    const interval = setInterval(() => {
      try {
        // Main: bloco na tela dos grupos com os phones
        const main = document.querySelector("#main");
        const headerElement = main?.querySelector("header");
        // Navegue até o elemento <span> dentro do headerElement
        const groupNameElement = headerElement?.querySelector(
          "span:not([data-icon])"
        );
        const contacts = headerElement?.querySelector(".selectable-text");
        // Obtenha o conteúdo do elemento <span>
        if (groupNameElement) {
          const data = contacts?.textContent;
          if (
            data &&
            data !== "click here for group info" &&
            data !== "clique para dados do grupo" &&
            !data.endsWith("is typing…")
          ) {
            const groupName = groupNameElement?.innerText;
            const contactsArr = data.split(",");
            console.log({ groupName, contactsArr });
            if (contactsArr.length > 1) {
              clearInterval(interval);
              contactsExport(contactsArr, groupName);
            }
          }
        }
      } catch (error) {
        console.log("Error: ", error);
        if (count >= 10) clearInterval(interval);
      }
      count++;
    }, 1000);
  },
  false
);

function contactsExport(contactsArr, groupName) {
  const contactsClean = [];
  contactsArr.filter((item) => {
    let contact = item?.replace(" ", "");
    if (contact?.startsWith("+")) {
      contactsClean.push(contact);
    }
  });

  chrome.storage.local.set({ contacts: contactsClean, groupName });
}
