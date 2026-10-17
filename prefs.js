import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class VisualTweakPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.search_enabled = true;
        window.set_title(_('Visual Tweak'));

        window.set_default_size(760, 660);
        window.set_resizable(false);

        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_string(`

            .visual-tweak-headerbar {
                border: none;
                box-shadow: none;
            }

            .visual-tweak-notebook {
                border: none;
                box-shadow: none;
                margin: 20px;
                background-color: @view_bg_color;
            }

            .visual-tweak-notebook > header {
                border: none;
                border-bottom: 1px solid @borders;
                box-shadow: none;
                margin: 0px;
            }

            .visual-tweak-notebook > header > tabs {
                border: none;
                box-shadow: none;
                margin: 0px 0px -1px 0px;
            }

            .visual-tweak-notebook > header > tabs > tab {
                border: none;
                border-top: 3px solid transparent;
                border-bottom: 3px solid transparent;
                box-shadow: none;
                padding: 0px 12px;
                margin: 0px 6px;
            }

            .visual-tweak-notebook > header > tabs > tab > label {
                vertical-align: middle;
                margin: 0px;
                padding: 0px;
                min-height: 0px;
            }

            .visual-tweak-notebook > header > tabs > tab:checked {
                border: none;
                border-top: 3px solid transparent;
                border-bottom: 3px solid @accent_color;
                box-shadow: none;
            }

            .visual-tweak-notebook > header > tabs > tab:hover {
                border: none;
                border-top: 3px solid transparent;
                border-bottom: 3px solid @borders;
                box-shadow: none;
            }

            .visual-tweak-notebook > header > tabs > tab:checked:hover {
                border: none;
                border-top: 3px solid transparent;
                border-bottom: 3px solid @accent_color;
                box-shadow: none;
            }

            .visual-tweak-notebook > stack {
                border: none;
                box-shadow: none;
                margin: 0px;
            }

            .visual-tweak-frame {
                border: none;
                box-shadow: none;
            }

        `);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        const vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });

        const header = new Gtk.HeaderBar();
        header.add_css_class('visual-tweak-headerbar');
        header.set_title_widget(new Gtk.Label({
            label: _('Visual Tweak'),
            css_classes: ['title'],
        }));
        header.set_show_title_buttons(true);
        window.set_titlebar(header);

        const notebook = new Gtk.Notebook();
        notebook.add_css_class('visual-tweak-notebook');
        notebook.set_size_request(700, -1);
        notebook.set_hexpand(false);
        notebook.set_halign(Gtk.Align.CENTER);

        // panel begin
        const panelPage = new Adw.PreferencesPage();

        const panelGroup = new Adw.PreferencesGroup({
            title: _('Panel Beautify'),
            description: _('Control whether the panel beautification is enabled'),
        });

        const enabledRow = new Adw.SwitchRow({
            title: _('Enable Panel Beautify'),
            subtitle: _('When enabled, the panel applies beautification effects'),
        });
        settings.bind('panel-enable', enabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(enabledRow);

        const opacityRow = this._createScaleRow({
            settings,
            key: 'panel-bgopacity',
            title: _('Panel Background Opacity'),
            subtitle: _('Opacity of the panel background, 0 = fully transparent, 100 = fully opaque'),
            lower: 0,
            upper: 100,
            step: 1,
            digits: 0,
            suffix: '%',
        });
        panelGroup.add(opacityRow);

        const colorEnabledRow = new Adw.SwitchRow({
            title: _('Custom Background Color'),
            subtitle: _('When enabled, the panel background uses the color specified below'),
        });
        settings.bind('panel-bgcolor-enable', colorEnabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(colorEnabledRow);

        const colorRow = this._createColorRow({
            settings,
            key: 'panel-bgcolor-color',
            title: _('Background Color'),
            subtitle: _('Panel background color in hexadecimal format, e.g. #000000 or #1c1c1c'),
        });
        panelGroup.add(colorRow);

        const syncColorRowSensitivity = () => {
            colorRow.set_sensitive(settings.get_boolean('panel-bgcolor-enable'));
        };
        settings.connect('changed::panel-bgcolor-enable', syncColorRowSensitivity);
        syncColorRowSensitivity();

        const textColorEnabledRow = new Adw.SwitchRow({
            title: _('Custom Text Color'),
            subtitle: _('When enabled, the panel text uses the color specified below'),
        });
        settings.bind('panel-fgcolor-enable', textColorEnabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(textColorEnabledRow);

        const textColorRow = this._createColorRow({
            settings,
            key: 'panel-fgcolor-color',
            title: _('Text Color'),
            subtitle: _('Panel text color in hexadecimal format, e.g. #ffffff or #ececec'),
        });
        panelGroup.add(textColorRow);

        const syncTextColorRowSensitivity = () => {
            textColorRow.set_sensitive(settings.get_boolean('panel-fgcolor-enable'));
        };
        settings.connect('changed::panel-fgcolor-enable', syncTextColorRowSensitivity);
        syncTextColorRowSensitivity();

        panelPage.add(panelGroup);

        notebook.append_page(panelPage, new Gtk.Label({ label: _('Panel') }));
        // panel end

        // clock begin
        const clockPage = new Adw.PreferencesPage();

        const clockGroup = new Adw.PreferencesGroup({
            title: _('Clock Format'),
            description: _('Customize the format of the panel clock'),
        });

        const clockEnableRow = new Adw.SwitchRow({
            title: _('Enable Clock Format'),
            subtitle: _('When enabled, the panel clock uses the custom format specified'),
        });
        settings.bind('clock-enable', clockEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        clockGroup.add(clockEnableRow);

        const clockFormatRow = new Adw.ActionRow({
            title: _('Clock Format'),
            subtitle: _('Custom clock format using strftime-style specifiers, e.g. %Y-%m-%d %H:%M:%S or %H:%M'),
        });

        const clockFormatLabel = new Gtk.Label({
            label: settings.get_string('clock-format'),
            valign: Gtk.Align.CENTER,
            xalign: 1,
            css_classes: ['dim-label'],
        });

        const clockFormatEntry = new Gtk.Entry({
            text: settings.get_string('clock-format'),
            valign: Gtk.Align.CENTER,
            width_request: 220,
            visible: false,
        });

        const clockFormatButton = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Edit'),
            css_classes: ['flat'],
        });

        let clockFormatEditing = false;

        const enterClockEditMode = () => {
            clockFormatEditing = true;
            clockFormatEntry.text = settings.get_string('clock-format');
            clockFormatLabel.visible = false;
            clockFormatEntry.visible = true;
            clockFormatButton.icon_name = 'object-select-symbolic';
            clockFormatButton.tooltip_text = _('Apply');
            clockFormatEntry.grab_focus();
            clockFormatEntry.set_position(-1);
        };

        const exitClockEditMode = (commit) => {
            clockFormatEditing = false;
            if (commit) {
                const value = clockFormatEntry.text;
                if (value !== settings.get_string('clock-format')) {
                    settings.set_string('clock-format', value);
                }
            }
            clockFormatLabel.label = settings.get_string('clock-format');
            clockFormatEntry.visible = false;
            clockFormatLabel.visible = true;
            clockFormatButton.icon_name = 'document-edit-symbolic';
            clockFormatButton.tooltip_text = _('Edit');
        };

        clockFormatButton.connect('clicked', () => {
            if (!clockFormatEditing) {
                enterClockEditMode();
            } else {
                exitClockEditMode(true);
            }
        });

        settings.connect('changed::clock-format', () => {
            const v = settings.get_string('clock-format');
            clockFormatLabel.label = v;
            if (!clockFormatEditing && clockFormatEntry.text !== v) {
                clockFormatEntry.text = v;
            }
        });

        clockFormatRow.add_suffix(clockFormatLabel);
        clockFormatRow.add_suffix(clockFormatEntry);
        clockFormatRow.add_suffix(clockFormatButton);
        clockGroup.add(clockFormatRow);

        const syncClockSensitivity = () => {
            clockFormatRow.set_sensitive(settings.get_boolean('clock-enable'));
        };
        settings.connect('changed::clock-enable', syncClockSensitivity);
        syncClockSensitivity();

        const formatSpecifiers = [
            ['%Y', _('Year (4-digit)')],
            ['%y', _('Year (2-digit)')],
            ['%m', _('Month (01-12)')],
            ['%d', _('Day (01-31)')],
            ['%e', _('Day (1-31)')],
            ['%H', _('Hour, 24h (00-23)')],
            ['%I', _('Hour, 12h (01-12)')],
            ['%M', _('Minute (00-59)')],
            ['%S', _('Second (00-59)')],
            ['%p', _('AM/PM')],
            ['%A', _('Weekday (full)')],
            ['%a', _('Weekday (short)')],
            ['%B', _('Month name (full)')],
            ['%b', _('Month name (short)')],
            ['%j', _('Day of year (001-366)')],
            ['%u', _('Weekday (1-7, Mon=1)')],
            ['%w', _('Weekday (0-6, Sun=0)')],
            ['%V', _('ISO week number (01-53)')],
            ['%Z', _('Time zone name')],
            ['%z', _('Time zone offset (+hhmm)')],
            ['%%', _('Literal %')],
        ];

        const specGrid = new Gtk.Grid({
            column_spacing: 24,
            row_spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
            hexpand: true,
        });

        for (let i = 0; i < formatSpecifiers.length; i++) {
            const [code, desc] = formatSpecifiers[i];
            const col = i % 2;
            const row = Math.floor(i / 2);

            const codeLabel = new Gtk.Label({
                label: code,
                xalign: 0,
                width_chars: 4,
                css_classes: ['monospace'],
            });

            const descLabel = new Gtk.Label({
                label: desc,
                xalign: 0,
                hexpand: true,
            });

            specGrid.attach(codeLabel, col * 2,     row, 1, 1);
            specGrid.attach(descLabel, col * 2 + 1, row, 1, 1);
        }

        const specInnerFrame = new Gtk.Frame({
            child: specGrid,
            hexpand: true,
            css_classes: ['visual-tweak-frame'],
        });

        const specTitleLabel = new Gtk.Label({
            label: _('Format Specifiers'),
            xalign: 0,
            css_classes: ['heading'],
        });

        const specOuterBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
            hexpand: true,
        });
        specOuterBox.append(specTitleLabel);
        specOuterBox.append(specInnerFrame);

        const specOuterFrame = new Gtk.Frame({
            child: specOuterBox,
            hexpand: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            css_classes: ['visual-tweak-frame'],
        });

        const specContainer = new Adw.ActionRow({ activatable: false });
        specContainer.set_child(specOuterFrame);
        clockGroup.add(specContainer);

        clockPage.add(clockGroup);

        notebook.append_page(clockPage, new Gtk.Label({ label: _('Clock') }));
        // clock end

        // about begin
        const aboutPage = new Adw.PreferencesPage();
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('Visual Tweak'),
            description: _('Configure some display effects of GNOME Shell'),
        });

        const homepageRow = new Adw.ActionRow({
            title: _('Homepage'),
            subtitle: 'github.com/bleakwind/visual-tweak',
            activatable: true,
        });
        homepageRow.connect('activated', () => {
            Gtk.show_uri(null, 'https://github.com/bleakwind/visual-tweak', Gdk.CURRENT_TIME);
        });
        aboutGroup.add(homepageRow);

        aboutPage.add(aboutGroup);
        notebook.append_page(aboutPage, new Gtk.Label({ label: _('About') }));
        // about end

        const centerBox = new Gtk.CenterBox({
            orientation: Gtk.Orientation.HORIZONTAL,
        });
        centerBox.set_center_widget(notebook);
        centerBox.set_hexpand(true);
        vbox.append(header);
        vbox.append(centerBox);

        window.set_content(vbox);
    }

    _createScaleRow({
        settings, key, title, subtitle,
        lower, upper, step, digits, suffix,
        mapTo = v => v,
        mapFrom = v => v,
    }) {
        const row = new Adw.ActionRow({ title, subtitle });

        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower,
                upper,
                step_increment: step,
                page_increment: step * 10,
            }),
            digits,
            draw_value: false,
            hexpand: true,
            width_request: 220,
            valign: Gtk.Align.CENTER,
        });

        const valueLabel = new Gtk.Label({
            width_chars: 5,
            xalign: 1,
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });

        const storedType = settings.get_value(key).get_type_string();

        const rawInit = settings.get_value(key).recursiveUnpack();
        const uiInit = mapTo(rawInit);
        scale.set_value(uiInit);
        valueLabel.set_label(`${uiInit.toFixed(digits)}${suffix}`);

        scale.connect('value-changed', () => {
            const v = scale.get_value();
            valueLabel.set_label(`${v.toFixed(digits)}${suffix}`);
            const stored = mapFrom(v);
            settings.set_value(key, new GLib.Variant(storedType, stored));
        });

        settings.connect(`changed::${key}`, () => {
            const r = settings.get_value(key).recursiveUnpack();
            const u = mapTo(r);
            if (Math.abs(scale.get_value() - u) > 1e-6) {
                scale.set_value(u);
                valueLabel.set_label(`${u.toFixed(digits)}${suffix}`);
            }
        });

        row.add_suffix(scale);
        row.add_suffix(valueLabel);
        row.activatable_widget = scale;
        return row;
    }

    _createColorRow({ settings, key, title, subtitle }) {
        const row = new Adw.ActionRow({ title, subtitle });

        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            use_alpha: false,
        });

        const applyToButton = (hex) => {
            const rgba = new Gdk.RGBA();
            if (rgba.parse(hex)) {
                colorButton.set_rgba(rgba);
            }
        };
        applyToButton(settings.get_string(key));

        colorButton.connect('color-set', () => {
            const rgba = colorButton.get_rgba();
            const hex = this._rgbaToHex(rgba);
            settings.set_string(key, hex);
        });

        settings.connect(`changed::${key}`, () => {
            applyToButton(settings.get_string(key));
        });

        row.add_suffix(colorButton);
        row.activatable_widget = colorButton;
        return row;
    }

    _rgbaToHex(rgba) {
        const toByte = (v) =>
            Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
        return `#${toByte(rgba.red)}${toByte(rgba.green)}${toByte(rgba.blue)}`;
    }
}

