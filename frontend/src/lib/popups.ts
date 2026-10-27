// Tracks whether a popup is open above the page. A picker's list is the only
// one today.
//
// A dialog closes on Escape and listens at the capture phase, so the key
// reaches it before anything inside it. That is right for a stray keypress in
// a form field and wrong for an open popup, where Escape means "close the
// popup" and closing the dialog throws away the edits behind it. Modal asks
// here before acting on Escape.
let open = 0

export function pushPopup(): void {
  open += 1
}

export function popPopup(): void {
  open = Math.max(0, open - 1)
}

export function popupIsOpen(): boolean {
  return open > 0
}
