document.addEventListener('click', function (e) {
  const linkAntigo = document.getElementsByClassName('whatsVHckl')
  console.log('Clicou...', linkAntigo)
  if (linkAntigo[0]) {
    linkAntigo[0].remove()
  }
  const interval = setInterval(() => {
    const [group] = document.getElementsByClassName('_3Id9P')
    const [main] = document.querySelectorAll('#main ._1hI5g')
    const groupName = main.innerText
    const data = group.innerText
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
          const [elementHeader] = document.getElementsByClassName('VPvMz')
          elementHeader.setAttribute('style', 'display:flex;')
          const elementHeaderSearch = document.getElementsByClassName('_2wfYK')
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
  }, 1000)
}, false);