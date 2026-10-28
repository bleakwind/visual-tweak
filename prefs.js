/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: prefs.js 2026-10-27 10:14:15 Bleakwind Exp $                       |
 * +-------------------------------------------------------------------------+
 * | Copyright (c) 2008-2026 Bleakwind(Rick Wu).                             |
 * +-------------------------------------------------------------------------+
 * | This source file is prefs.js.                                           |
 * | This source file is released under BSD license.                         |
 * +-------------------------------------------------------------------------+
 * | Author: Bleakwind(Rick Wu) <bleakwind@qq.com>                           |
 * +-------------------------------------------------------------------------+
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class VisualTweakPreferences extends ExtensionPreferences {

    /**
     * @brief Build the preferences window content
     * @param window The Adw.PreferencesWindow to fill
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.search_enabled = false;
        window.set_title(_('Visual Tweak'));

        window.set_default_size(760, 680);
        window.set_resizable(false);

        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_string(`
            .visual-tweak-headerbar { border: none; box-shadow: none; }
            .visual-tweak-notebook { border: none; box-shadow: none; margin: 20px; background-color: @view_bg_color; }
            .visual-tweak-notebook > header { border: none; border-bottom: 1px solid @borders; box-shadow: none; margin: 0px; }
            .visual-tweak-notebook > header > tabs { border: none; box-shadow: none; margin: 0px 0px -1px 0px; }
            .visual-tweak-notebook > header > tabs > tab { border: none; border-top: 3px solid transparent; border-bottom: 3px solid transparent; box-shadow: none; padding: 0px 12px; margin: 0px 6px; }
            .visual-tweak-notebook > header > tabs > tab > label { vertical-align: middle; margin: 0px; padding: 0px; min-height: 0px; }
            .visual-tweak-notebook > header > tabs > tab:checked { border: none; border-top: 3px solid transparent; border-bottom: 3px solid @accent_color; box-shadow: none; }
            .visual-tweak-notebook > header > tabs > tab:hover { border: none; border-top: 3px solid transparent; border-bottom: 3px solid @borders; box-shadow: none; }
            .visual-tweak-notebook > header > tabs > tab:checked:hover { border: none; border-top: 3px solid transparent; border-bottom: 3px solid @accent_color; box-shadow: none; }
            .visual-tweak-notebook > stack { border: none; box-shadow: none; margin: 0px; }
            .visual-tweak-frame { border: none; box-shadow: none; }
        `);
        const display = Gdk.Display.get_default();
        Gtk.StyleContext.add_provider_for_display(
            display,
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        window.connect('destroy', () => {
            try {
                Gtk.StyleContext.remove_provider_for_display(display, cssProvider);
            } catch (e) {}
        });

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

        const panelGlobalEnableRow = new Adw.SwitchRow({
            title: _('Enable Panel Beautify'),
            subtitle: _('When enabled, the panel applies beautification effects'),
        });
        settings.bind('panel-global-enable', panelGlobalEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(panelGlobalEnableRow);

        const panelBackgroundOpacityRow = this._createScaleRow({
            settings,
            key: 'panel-background-opacity',
            title: _('Panel Background Opacity'),
            subtitle: _('Opacity of the panel background, 0 = fully transparent, 100 = fully opaque'),
            lower: 0, upper: 100, step: 1, digits: 0, suffix: '%',
        });
        panelGroup.add(panelBackgroundOpacityRow);

        const panelBgcolorEnableRow = new Adw.SwitchRow({
            title: _('Custom Background Color'),
            subtitle: _('When enabled, the panel background uses the color specified below'),
        });
        settings.bind('panel-bgcolor-enable', panelBgcolorEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(panelBgcolorEnableRow);

        const panelBgcolorColorRow = this._createColorRow({
            settings,
            key: 'panel-bgcolor-color',
            title: _('Background Color'),
            subtitle: _('Panel background color in hexadecimal format, e.g. #000000 or #1c1c1c'),
        });
        panelGroup.add(panelBgcolorColorRow);

        const panelBgcolorEnableBind = () => {
            panelBgcolorColorRow.set_sensitive(settings.get_boolean('panel-bgcolor-enable'));
        };
        settings.connect('changed::panel-bgcolor-enable', panelBgcolorEnableBind);
        panelBgcolorEnableBind();

        const panelFgcolorEnableRow = new Adw.SwitchRow({
            title: _('Custom Text Color'),
            subtitle: _('When enabled, the panel text uses the color specified below'),
        });
        settings.bind('panel-fgcolor-enable', panelFgcolorEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(panelFgcolorEnableRow);

        const panelFgcolorColorRow = this._createColorRow({
            settings,
            key: 'panel-fgcolor-color',
            title: _('Text Color'),
            subtitle: _('Panel text color in hexadecimal format, e.g. #ffffff or #ececec'),
        });
        panelGroup.add(panelFgcolorColorRow);

        const panelFgcolorEnableBind = () => {
            panelFgcolorColorRow.set_sensitive(settings.get_boolean('panel-fgcolor-enable'));
        };
        settings.connect('changed::panel-fgcolor-enable', panelFgcolorEnableBind);
        panelFgcolorEnableBind();

        panelPage.add(panelGroup);
        notebook.append_page(panelPage, new Gtk.Label({ label: _('Panel') }));
        // panel end

        // window begin
        const windowPage = new Adw.PreferencesPage();
        const windowGroup = new Adw.PreferencesGroup({
            title: _('Window Effects'),
            description: _('Control window display effects'),
        });

        const windowOpenEnableRow = new Adw.SwitchRow({
            title: _('Enable Window Open Effect'),
            subtitle: _('When enabled, play animation effect when opening window'),
        });
        settings.bind('window-open-enable', windowOpenEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(windowOpenEnableRow);

        const windowOpenTypeRow = new Adw.ActionRow({
            title: _('Window Open Effect Type'),
            subtitle: _('Select window open animation effect'),
        });
        const windowOpenTypeList = new Gtk.StringList();
        windowOpenTypeList.append(_('TV Effect'));
        windowOpenTypeList.append(_('Blinds Effect'));
        const windowOpenTypeMap = [
            { value: 'tv', label: _('TV Effect') },
            { value: 'blinds', label: _('Blinds Effect') },
        ];
        const windowOpenTypeDown = new Gtk.DropDown({
            model: windowOpenTypeList, valign: Gtk.Align.CENTER, width_request: 200,
        });

        const windowOpenTypeSetting = () => {
            const curVal = settings.get_string('window-open-type');
            const idx = windowOpenTypeMap.findIndex(item => item.value === curVal);
            if (idx >= 0) windowOpenTypeDown.set_selected(idx);
        };
        windowOpenTypeSetting();

        windowOpenTypeDown.connect('notify::selected', () => {
            const selIdx = windowOpenTypeDown.get_selected();
            if (windowOpenTypeMap[selIdx]) {
                settings.set_string('window-open-type', windowOpenTypeMap[selIdx].value);
            }
        });

        settings.connect('changed::window-open-type', windowOpenTypeSetting);
        windowOpenTypeRow.add_suffix(windowOpenTypeDown);
        windowOpenTypeRow.activatable_widget = windowOpenTypeDown;
        windowGroup.add(windowOpenTypeRow);

        const windowOpenEnableBind = () => {
            windowOpenTypeRow.set_sensitive(settings.get_boolean('window-open-enable'));
        };
        settings.connect('changed::window-open-enable', windowOpenEnableBind);
        windowOpenEnableBind();

        const windowCloseEnableRow = new Adw.SwitchRow({
            title: _('Enable Window Close Effect'),
            subtitle: _('When enabled, play animation effect when closing window'),
        });
        settings.bind('window-close-enable', windowCloseEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(windowCloseEnableRow);

        const windowCloseTypeRow = new Adw.ActionRow({
            title: _('Window Close Effect Type'),
            subtitle: _('Select window close animation effect'),
        });
        const windowCloseTypeList = new Gtk.StringList();
        windowCloseTypeList.append(_('TV Effect'));
        windowCloseTypeList.append(_('Blinds Effect'));
        const windowCloseTypeMap = [
            { value: 'tv', label: _('TV Effect') },
            { value: 'blinds', label: _('Blinds Effect') },
        ];
        const windowCloseTypeDown = new Gtk.DropDown({
            model: windowCloseTypeList, valign: Gtk.Align.CENTER, width_request: 200,
        });

        const windowCloseTypeSetting = () => {
            const curVal = settings.get_string('window-close-type');
            const idx = windowCloseTypeMap.findIndex(item => item.value === curVal);
            if (idx >= 0) windowCloseTypeDown.set_selected(idx);
        };
        windowCloseTypeSetting();

        windowCloseTypeDown.connect('notify::selected', ()=>{
            const selIdx = windowCloseTypeDown.get_selected();
            if (windowCloseTypeMap[selIdx]){
                settings.set_string('window-close-type', windowCloseTypeMap[selIdx].value);
            }
        });

        settings.connect('changed::window-close-type', windowCloseTypeSetting);
        windowCloseTypeRow.add_suffix(windowCloseTypeDown);
        windowCloseTypeRow.activatable_widget = windowCloseTypeDown;
        windowGroup.add(windowCloseTypeRow);

        const windowCloseEnableBind = () => {
            windowCloseTypeRow.set_sensitive(settings.get_boolean('window-close-enable'));
        };
        settings.connect('changed::window-close-enable', windowCloseEnableBind);
        windowCloseEnableBind();

        const windowMinimizeEnableRow = new Adw.SwitchRow({
            title: _('Enable Window Minimize Effect'),
            subtitle: _('When enabled, play animation effect when minimizing window'),
        });
        settings.bind('window-minimize-enable', windowMinimizeEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(windowMinimizeEnableRow);

        const windowMinimizeTypeRow = new Adw.ActionRow({
            title: _('Window Minimize Effect Type'),
            subtitle: _('Select window minimize animation effect'),
        });
        const windowMinimizeTypeList = new Gtk.StringList();
        windowMinimizeTypeList.append(_('Genie Effect'));
        windowMinimizeTypeList.append(_('Scale Effect'));
        const windowMinimizeTypeMap = [
            { value: 'genie', label: _('Genie Effect') },
            { value: 'scale', label: _('Scale Effect') },
        ];
        const windowMinimizeTypeDown = new Gtk.DropDown({
            model: windowMinimizeTypeList, valign: Gtk.Align.CENTER, width_request: 200,
        });

        const windowMinimizeTypeSetting = () => {
            const curVal = settings.get_string('window-minimize-type');
            const idx = windowMinimizeTypeMap.findIndex(item => item.value === curVal);
            if (idx >= 0) windowMinimizeTypeDown.set_selected(idx);
        };
        windowMinimizeTypeSetting();

        windowMinimizeTypeDown.connect('notify::selected', () => {
            const selIdx = windowMinimizeTypeDown.get_selected();
            if (windowMinimizeTypeMap[selIdx]) {
                settings.set_string('window-minimize-type', windowMinimizeTypeMap[selIdx].value);
            }
        });

        settings.connect('changed::window-minimize-type', windowMinimizeTypeSetting);
        windowMinimizeTypeRow.add_suffix(windowMinimizeTypeDown);
        windowMinimizeTypeRow.activatable_widget = windowMinimizeTypeDown;
        windowGroup.add(windowMinimizeTypeRow);

        const windowMinimizeEnableBind = () => {
            windowMinimizeTypeRow.set_sensitive(settings.get_boolean('window-minimize-enable'));
        };
        settings.connect('changed::window-minimize-enable', windowMinimizeEnableBind);
        windowMinimizeEnableBind();

        const windowUnminimizeEnableRow = new Adw.SwitchRow({
            title: _('Enable Window Unminimize Effect'),
            subtitle: _('When enabled, play animation effect when restoring window'),
        });
        settings.bind('window-unminimize-enable', windowUnminimizeEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        windowGroup.add(windowUnminimizeEnableRow);

        const windowUnminimizeTypeRow = new Adw.ActionRow({
            title: _('Window Unminimize Effect Type'),
            subtitle: _('Select window unminimize animation effect'),
        });
        const windowUnminimizeTypeList = new Gtk.StringList();
        windowUnminimizeTypeList.append(_('Genie Effect'));
        windowUnminimizeTypeList.append(_('Scale Effect'));
        const windowUnminimizeTypeMap = [
            { value: 'genie', label: _('Genie Effect') },
            { value: 'scale', label: _('Scale Effect') },
        ];
        const windowUnminimizeTypeDown = new Gtk.DropDown({
            model: windowUnminimizeTypeList, valign: Gtk.Align.CENTER, width_request: 200,
        });

        const windowUnminimizeTypeSetting = () => {
            const curVal = settings.get_string('window-unminimize-type');
            const idx = windowUnminimizeTypeMap.findIndex(item => item.value === curVal);
            if (idx >= 0) windowUnminimizeTypeDown.set_selected(idx);
        };
        windowUnminimizeTypeSetting();

        windowUnminimizeTypeDown.connect('notify::selected', () => {
            const selIdx = windowUnminimizeTypeDown.get_selected();
            if (windowUnminimizeTypeMap[selIdx]) {
                settings.set_string('window-unminimize-type', windowUnminimizeTypeMap[selIdx].value);
            }
        });

        settings.connect('changed::window-unminimize-type', windowUnminimizeTypeSetting);
        windowUnminimizeTypeRow.add_suffix(windowUnminimizeTypeDown);
        windowUnminimizeTypeRow.activatable_widget = windowUnminimizeTypeDown;
        windowGroup.add(windowUnminimizeTypeRow);

        const windowUnminimizeEnableBind = () => {
            windowUnminimizeTypeRow.set_sensitive(settings.get_boolean('window-unminimize-enable'));
        };
        settings.connect('changed::window-unminimize-enable', windowUnminimizeEnableBind);
        windowUnminimizeEnableBind();

        windowPage.add(windowGroup);
        notebook.append_page(windowPage, new Gtk.Label({ label: _('Window') }));
        // window end

        // dock begin
        const dockPage = new Adw.PreferencesPage();
        const dockGroup = new Adw.PreferencesGroup({
            title: _('Dock'),
            description: _('A bottom dock that appears when the pointer touches the bottom edge'),
        });

        const dockShowEnableRow = new Adw.SwitchRow({
            title: _('Enable Dock'),
            subtitle: _('When enabled, show a dock at the bottom of the screen that appears when the pointer touches the bottom edge'),
        });
        settings.bind('dock-show-enable', dockShowEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        dockGroup.add(dockShowEnableRow);

        const dockIconSizes = [16, 24, 32, 48, 64, 96, 128];
        const dockIconSizeRow = new Adw.ActionRow({
            title: _('Dock Icon Size'),
            subtitle: _('Size of the dock icons in pixels'),
        });
        const dockIconSizeScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower: 16, upper: 128, step_increment: 1, page_increment: 10 }),
            digits: 0, draw_value: false, hexpand: false, width_request: 220, valign: Gtk.Align.CENTER,
        });
        const dockIconSizeLabel = new Gtk.Label({
            width_chars: 5, xalign: 1, valign: Gtk.Align.CENTER, css_classes: ['dim-label'],
            hexpand: false,
        });

        const snapToNearestSize = (val) => {
            let best = dockIconSizes[0];
            let minDiff = Infinity;
            for (const s of dockIconSizes) {
                const diff = Math.abs(s - val);
                if (diff < minDiff) {
                    minDiff = diff;
                    best = s;
                }
            }
            return best;
        };

        const updateDockIconSizeUI = (val) => {
            dockIconSizeScale.set_value(val);
            dockIconSizeLabel.set_label(`${val} px`);
        };

        let isUpdatingIconSize = false;

        dockIconSizeScale.set_value(settings.get_int('dock-icon-size'));
        dockIconSizeLabel.set_label(`${settings.get_int('dock-icon-size')} px`);

        dockIconSizeScale.connect('value-changed', () => {
            if (isUpdatingIconSize) return;
            const rawVal = dockIconSizeScale.get_value();
            const snapped = snapToNearestSize(rawVal);
            dockIconSizeLabel.set_label(`${snapped} px`);

            if (snapped !== rawVal) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    isUpdatingIconSize = true;
                    dockIconSizeScale.set_value(snapped);
                    isUpdatingIconSize = false;
                    return GLib.SOURCE_REMOVE;
                });
            }

            if (settings.get_int('dock-icon-size') !== snapped) {
                settings.set_int('dock-icon-size', snapped);
            }
        });

        settings.connect('changed::dock-icon-size', () => {
            const v = settings.get_int('dock-icon-size');
            if (Math.abs(dockIconSizeScale.get_value() - v) > 0.1) {
                isUpdatingIconSize = true;
                updateDockIconSizeUI(v);
                isUpdatingIconSize = false;
            } else {
                dockIconSizeLabel.set_label(`${v} px`);
            }
        });

        dockIconSizeRow.add_suffix(dockIconSizeScale);
        dockIconSizeRow.add_suffix(dockIconSizeLabel);
        dockIconSizeRow.activatable_widget = dockIconSizeScale;
        dockGroup.add(dockIconSizeRow);

        const dockBgColorRow = this._createColorRow({
            settings,
            key: 'dock-background-color',
            title: _('Dock Background Color'),
            subtitle: _('Dock background color in hexadecimal format, e.g. #000000 or #1c1c1c'),
        });
        dockGroup.add(dockBgColorRow);

        const dockBgOpacityRow = this._createScaleRow({
            settings,
            key: 'dock-background-opacity',
            title: _('Dock Background Opacity'),
            subtitle: _('Opacity of the dock background, 0 = fully transparent, 100 = fully opaque'),
            lower: 0, upper: 100, step: 1, digits: 0, suffix: '%',
        });
        dockGroup.add(dockBgOpacityRow);

        const dockEnableBind = () => {
            const on = settings.get_boolean('dock-show-enable');
            dockIconSizeRow.set_sensitive(on);
            dockBgColorRow.set_sensitive(on);
            dockBgOpacityRow.set_sensitive(on);
        };
        settings.connect('changed::dock-show-enable', dockEnableBind);
        dockEnableBind();

        dockPage.add(dockGroup);
        notebook.append_page(dockPage, new Gtk.Label({ label: _('Dock') }));
        // dock end

        // clock begin
        const clockPage = new Adw.PreferencesPage();
        const clockGroup = new Adw.PreferencesGroup({
            title: _('Clock Format'),
            description: _('Customize the format of the panel clock'),
        });

        const clockFormatEnableRow = new Adw.SwitchRow({
            title: _('Enable Clock Format'),
            subtitle: _('When enabled, the panel clock uses the custom format specified'),
        });
        settings.bind('clock-format-enable', clockFormatEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        clockGroup.add(clockFormatEnableRow);

        const clockFormatStringRow = new Adw.ActionRow({
            title: _('Clock Format'),
            subtitle: _('Custom clock format using strftime-style specifiers, e.g. %Y-%m-%d %H:%M or %H:%M:%S'),
        });

        const clockFormatStringLabel = new Gtk.Label({
            label: settings.get_string('clock-format-string'),
            valign: Gtk.Align.CENTER,
            xalign: 1,
            css_classes: ['dim-label'],
        });

        const clockFormatStringEntry = new Gtk.Entry({
            text: settings.get_string('clock-format-string'),
            valign: Gtk.Align.CENTER,
            width_request: 220,
            visible: false,
        });

        const clockFormatStringButton = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Edit'),
            css_classes: ['flat'],
        });

        let clockFormatStringEditing = false;

        const clockFormatStringInto = () => {
            clockFormatStringEditing = true;
            clockFormatStringEntry.text = settings.get_string('clock-format-string');
            clockFormatStringLabel.visible = false;
            clockFormatStringEntry.visible = true;
            clockFormatStringButton.icon_name = 'object-select-symbolic';
            clockFormatStringButton.tooltip_text = _('Apply');
            clockFormatStringEntry.grab_focus();
            clockFormatStringEntry.set_position(-1);
        };

        const clockFormatStringExit = (commit) => {
            clockFormatStringEditing = false;
            if (commit) {
                const value = clockFormatStringEntry.text;
                if (value !== settings.get_string('clock-format-string')) {
                    settings.set_string('clock-format-string', value);
                }
            }
            clockFormatStringLabel.label = settings.get_string('clock-format-string');
            clockFormatStringEntry.visible = false;
            clockFormatStringLabel.visible = true;
            clockFormatStringButton.icon_name = 'document-edit-symbolic';
            clockFormatStringButton.tooltip_text = _('Edit');
        };

        clockFormatStringButton.connect('clicked', () => {
            if (!clockFormatStringEditing) clockFormatStringInto();
            else clockFormatStringExit(true);
        });

        clockFormatStringEntry.connect('activate', () => {
            if (clockFormatStringEditing) clockFormatStringExit(true);
        });

        settings.connect('changed::clock-format-string', () => {
            const v = settings.get_string('clock-format-string');
            clockFormatStringLabel.label = v;
            if (!clockFormatStringEditing && clockFormatStringEntry.text !== v) {
                clockFormatStringEntry.text = v;
            }
        });

        clockFormatStringRow.add_suffix(clockFormatStringLabel);
        clockFormatStringRow.add_suffix(clockFormatStringEntry);
        clockFormatStringRow.add_suffix(clockFormatStringButton);
        clockGroup.add(clockFormatStringRow);

        const clockFormatEnableBind = () => {
            clockFormatStringRow.set_sensitive(settings.get_boolean('clock-format-enable'));
        };
        settings.connect('changed::clock-format-enable', clockFormatEnableBind);
        clockFormatEnableBind();

        const clockFormatSpecifiersString = [
            ['%Y', _('Year (4-digit)')], ['%y', _('Year (2-digit)')], ['%m', _('Month (01-12)')],
            ['%d', _('Day (01-31)')], ['%e', _('Day (1-31)')], ['%H', _('Hour, 24h (00-23)')],
            ['%I', _('Hour, 12h (01-12)')], ['%M', _('Minute (00-59)')], ['%S', _('Second (00-59)')],
            ['%p', _('AM/PM')], ['%A', _('Weekday (full)')], ['%a', _('Weekday (short)')],
            ['%B', _('Month name (full)')], ['%b', _('Month name (short)')], ['%j', _('Day of year (001-366)')],
            ['%u', _('Weekday (1-7, Mon=1)')], ['%w', _('Weekday (0-6, Sun=0)')], ['%V', _('ISO week number (01-53)')],
            ['%Z', _('Time zone name')], ['%z', _('Time zone offset (+hhmm)')], ['%%', _('Literal %')],
        ];

        const clockFormatSpecifiersGrid = new Gtk.Grid({
            column_spacing: 24, row_spacing: 6, margin_top: 6, margin_bottom: 6,
            margin_start: 6, margin_end: 6, hexpand: true,
        });

        for (let i = 0; i < clockFormatSpecifiersString.length; i++) {
            const [code, desc] = clockFormatSpecifiersString[i];
            const col = i % 2;
            const row = Math.floor(i / 2);

            const codeLabel = new Gtk.Label({ label: code, xalign: 0, width_chars: 4, css_classes: ['monospace'] });
            const descLabel = new Gtk.Label({ label: desc, xalign: 0, hexpand: true });

            clockFormatSpecifiersGrid.attach(codeLabel, col * 2, row, 1, 1);
            clockFormatSpecifiersGrid.attach(descLabel, col * 2 + 1, row, 1, 1);
        }

        const specInnerFrame = new Gtk.Frame({ child: clockFormatSpecifiersGrid, hexpand: true, css_classes: ['visual-tweak-frame'] });
        const specTitleLabel = new Gtk.Label({ label: _('Format Specifiers'), xalign: 0, css_classes: ['heading'] });
        const specOuterBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL, spacing: 6, margin_top: 6,
            margin_bottom: 6, margin_start: 6, margin_end: 6, hexpand: true,
        });
        specOuterBox.append(specTitleLabel);
        specOuterBox.append(specInnerFrame);

        const specOuterFrame = new Gtk.Frame({
            child: specOuterBox, hexpand: true, margin_top: 12, margin_bottom: 12,
            margin_start: 12, margin_end: 12, css_classes: ['visual-tweak-frame'],
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

        const aboutWebsiteUrlRow = new Adw.ActionRow({
            title: _('Homepage'),
            subtitle: 'github.com/bleakwind/visual-tweak',
            activatable: true,
        });
        aboutWebsiteUrlRow.connect('activated', () => {
            Gtk.show_uri(null, 'https://github.com/bleakwind/visual-tweak', Gdk.CURRENT_TIME);
        });
        aboutGroup.add(aboutWebsiteUrlRow);
        aboutPage.add(aboutGroup);
        notebook.append_page(aboutPage, new Gtk.Label({ label: _('About') }));
        // about end

        const centerBox = new Gtk.CenterBox({ orientation: Gtk.Orientation.HORIZONTAL });
        centerBox.set_center_widget(notebook);
        centerBox.set_hexpand(true);
        vbox.append(header);
        vbox.append(centerBox);

        window.set_content(vbox);
    }

    /**
     * @brief Create a scale row bound to an integer or double settings key
     * @param options Row options: settings, key, title, subtitle, lower, upper, step, digits, suffix, mapTo, mapFrom
     * @return A new Adw.ActionRow containing the scale and a value label
     */
    _createScaleRow({
        settings, key, title, subtitle, lower, upper, step, digits, suffix,
        mapTo = v => v, mapFrom = v => Math.round(v),
    }) {
        const row = new Adw.ActionRow({ title, subtitle });
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: step * 10 }),
            digits, draw_value: false, hexpand: false, width_request: 220, valign: Gtk.Align.CENTER,
        });

        const valueLabel = new Gtk.Label({
            width_chars: 5, xalign: 1, valign: Gtk.Align.CENTER, css_classes: ['dim-label'],
            hexpand: false,
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

    /**
     * @brief Create a color row bound to a hex string settings key
     * @param options Row options: settings, key, title, subtitle
     * @return A new Adw.ActionRow containing the color button
     */
    _createColorRow({ settings, key, title, subtitle }) {
        const row = new Adw.ActionRow({ title, subtitle });
        const colorButton = new Gtk.ColorButton({ valign: Gtk.Align.CENTER, use_alpha: false });

        const applyToButton = (hex) => {
            const rgba = new Gdk.RGBA();
            if (rgba.parse(hex)) colorButton.set_rgba(rgba);
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

    /**
     * @brief Convert a Gdk.RGBA color to a lowercase hex string
     * @param rgba The RGBA color to convert
     * @return A string like '#rrggbb'
     */
    _rgbaToHex(rgba) {
        const toByte = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
        return `#${toByte(rgba.red)}${toByte(rgba.green)}${toByte(rgba.blue)}`;
    }
}
