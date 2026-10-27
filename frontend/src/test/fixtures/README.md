# Test fixtures: where these messages come from

The seven `.html` files here are copies of real mail received by the maintainer — QQ Mail
notifications, a QWeather billing receipt and activation mail, a Steam login notice and an
AFFiNE sign-in mail — kept because they are the shapes the dark-mail pass has to survive:
inline styles, a stripped stylesheet, picture-based layouts, coloured panels and quoted
replies.

They were sanitised before publication:

- real addresses replaced with `*.@qq.example` / `example` placeholders;
- personal names, account handles, nicknames and bill numbers replaced with neutral stand-ins;
- one-time codes replaced with `000000` / `TEST0` (the mail-darkening tests assert that the code
  survives the transform, not what the code was);
- opaque tracking tokens in links replaced with same-length placeholders, so link length and
  encoding stay representative.

No remote resource is loaded by these fixtures: they are inert HTML, read as text by
`frontend/src/lib/maildark-real.test.ts` and passed through the same transform the app uses.

If you add a new fixture, do the same: keep the structure that makes the mail hard to darken,
and replace anything that identifies a person.
