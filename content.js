document.addEventListener('click', function (e) {
  const linkAntigo = document.getElementsByClassName('whatsVHckl')
  if (linkAntigo[0]) {
    linkAntigo[0].remove()
  }
  let count = 0
  const interval = setInterval(() => {
    const [group] = document.getElementsByClassName('z4t2k')
    const [main] = document.querySelectorAll('#main .YmixP')
    try {
      const groupName = group.innerText
      const data = main.innerText
      if (data && data != 'click here for group info') {
        clearInterval(interval)
        const contactsArr = data.split(',')
        if (contactsArr.length > 1) {
          const contactsFilter = contactsArr.filter(item => {
            let contact = item.replace(/ |-/g, "")
            if (contact.startsWith('+')) {
              return contact
            }
          })
          let contactsClean = contactsFilter.map(item => {
            let contact = item.replace(/ |-|(|)/g, "")
            return contact
          })
          if (contactsClean) {
            const [elementHeader] = document.getElementsByClassName('_1-qgF')
            elementHeader.setAttribute('style', 'display:flex;')
            const elementHeaderSearch = document.getElementsByClassName('_2n-zq')
            elementHeaderSearch[4].setAttribute('style', 'display:none;')

            let documentCSV = `Phones
`
            for (const item of contactsClean) {
              documentCSV += `${item}
`
            }

            let whatsVHckl = document.createElement('div')
            whatsVHckl.className = 'whatsVHckl'
            whatsVHckl.setAttribute('style', 'z-index:100;width:40px;height:40px;padding-left:5px;')

            const wa = document.createElement('img')
            wa.className = 'wa-o2obots-logo'
            wa.setAttribute('src', 'https://vitor.henckel.com.br/img/whats3.png')
            wa.setAttribute('width', '40px')
            wa.setAttribute('height', '40px')

            elementHeader.appendChild(whatsVHckl)

            const lk = document.createElement('a')

            lk.href = window.URL.createObjectURL(
              new Blob([documentCSV], {
                type: "text/csv"
              })
            )
            lk.setAttribute("download", `${groupName}.csv`)
            // lk.click()
            // window.URL.revokeObjectURL(lk.href)
            whatsVHckl.append(lk)
            lk.append(wa)
          }
        }
      }
    } catch (error) {
      console.log('Error: ', error)
      if (count >= 10) clearInterval(interval)
    }
    count++
  }, 1000)
}, false);