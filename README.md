# visual-tweak

## A GNOME Shell extension to configure some display effects of GNOME Shell...
Visual Tweak is a lightweight GNOME Shell extension that lets you customize various visual aspects of the GNOME desktop. It is designed to grow over time, and currently it focuses on beautifying the top panel and customizing the clock, with more display-related features planned for the future.

## Features
- Custom panel background opacity adjustable from fully transparent to fully opaque
- Custom panel background color with a color picker
- Custom panel text color applied to labels and icons
- Custom clock format using strftime-style specifiers (e.g. `%Y-%m-%d %H:%M:%S`)

## Screenshot
![Visual Tweak Screenshot](https://github.com/bleakwind/visual-tweak/blob/main/visual-tweak.jpg)

## Requirements
GNOME Shell 45, 46, 47, 48, or 49

## Installation

Copy the extension folder to your local extensions directory:
```shell
cp -r visual-tweak@bleakwind.github.com ~/.local/share/gnome-shell/extensions/
```

Then compile the GSettings schema:
```shell
glib-compile-schemas ~/.local/share/gnome-shell/extensions/visual-tweak@bleakwind.github.com/schemas/
```

Finally, restart GNOME Shell (Alt+F2, type r, press Enter)

## Configuration

Open gnome-extensions-app, and press visual-tweak to configure.

## License
BSD 2-Clause - See LICENSE file

