# visual-tweak

## A GNOME Shell extension to configure some display effects of GNOME Shell...
Visual Tweak is a lightweight GNOME Shell extension that lets you customize various visual aspects of the GNOME desktop. It is designed to grow over time, and currently it focuses on beautifying the top panel, customizing the clock, and providing an auto-hiding bottom dock, with more display-related features planned for the future.

## Features
- Custom panel background opacity adjustable from fully transparent to fully opaque
- Custom panel background color with a color picker
- Custom panel text color applied to labels and icons
- Custom Window open animation effect with selectable type
- Custom Window close animation effect with selectable type
- Custom Window minimize animation effect with selectable type
- Custom Window unminimize (restore) animation effect with selectable type
- Auto-hiding bottom dock that appears when the pointer touches the bottom edge
- Dock with configurable icon size, background color and background opacity
- Dock showing favorites, running apps, running indicators and app tooltips
- Dock context menu with window thumbnails, New Window, Pin/Unpin and Quit
- Dock drag-and-drop reordering of favorite apps
- Dock click actions: activate/cycle windows, open new window, shift-click minimize
- Custom clock format using strftime-style specifiers

## How It Works

#### Window Open
- **`TV effect`** - In the first 20% of the animation the window is squashed vertically into a line while a white beam expands from the center to both sides. In the remaining 80% the beam expands vertically into the full window while the beam fades out.
- **`Blinds effect`** - The window height is split into multiple blades, each with a black mask on its top and bottom. With an eased-in progress the visible area of each blade grows from a minimum line height to the full blade height.

#### Window Close
- **`TV effect`** - The window is first compressed vertically into a horizontal line while the white beam appears. The line then collapses toward the center into a point, and the window and beam fade out together.
- **`Blinds effect`** - The reverse of open: each blade's visible area shrinks from full height to a minimum line height, the black masks gradually close over the window, and the whole thing fades out at the end.

#### Window Minimize
- **`Genie effect`** - Each row of vertices is interpolated toward the icon anchor along the "toward the icon" direction, and the left and right edges converge toward the center using a quadratic Bézier curve to form a funnel. The control point is taken at the midpoint between the window edge and the icon edge, then offset outward by a curvature factor so the curve bulges out before tucking into the icon. Rows are staggered in time so rows closer to the icon start earlier, producing a wave-like "sucked in" effect.
- **`Scale effect`** - The grid of vertices is scaled uniformly toward the icon center using a cubic ease-out, so all vertices converge linearly on that point.

#### Window Unminimize
- **`Genie effect`** - Reuses the Genie geometry from minimize, but the progress is inverted, so the window appears to be "pulled out" from the icon and expand to its original size.
- **`Scale effect`** - Reuses the scaling of vertices from the Scale effect in minimize, with inverted progress, so the window grows from the icon center back to its original size and becomes visible again when done.

#### Dock
- **Appearance** - Background color and background opacity (0-100%) are configurable. The dock's window icon geometry is reported to the compositor so minimize/genie effects fly toward the dock icon.
- **Overview** - While the dock is enabled, the system dash is set to fully transparent (opacity 0) and made non-reactive. When the overview is open, the extension's dock replaces it and stays visible at the bottom without hiding.
- **Visibility** - The dock is normally hidden below the screen edge. It slides up when the pointer reaches the bottom edge of the screen, triggered by dwelling in the hot zone, moving the pointer down quickly, or entering the hot zone and moving horizontally far enough.
- **Auto-hide** - Once shown, the dock stays visible while no window covers its area. When a window overlaps the dock region on the active workspace, the dock hides after a short delay unless the pointer is inside the dock or a context menu is open.
- **Click actions** - Left click activates the app and cycles through its windows on the active workspace; middle click opens a new window (or activates the app if it cannot open a new one); right click opens a context menu with window thumbnails or a text list, plus New Window, Pin/Unpin and Quit.
- **Shift click** - A single shift click minimizes one window of the app on the active workspace and advances a per-app cursor; a double shift click minimizes all of that app's windows on the active workspace.
- **Drag and drop** - Favorite icons can be dragged to reorder them; the new order is saved to the `favorite-apps` key of `org.gnome.shell`.

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
