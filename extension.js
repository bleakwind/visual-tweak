/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: extension.js 2026-10-27 17:08:01 Bleakwind Exp $                   |
 * +-------------------------------------------------------------------------+
 * | Copyright (c) 2008-2026 Bleakwind(Rick Wu).                             |
 * +-------------------------------------------------------------------------+
 * | This source file is extension.js.                                       |
 * | This source file is released under BSD license.                         |
 * +-------------------------------------------------------------------------+
 * | Author: Bleakwind(Rick Wu) <bleakwind@qq.com>                           |
 * +-------------------------------------------------------------------------+
 */

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ModulePanel } from './module_panel.js';
import { ModuleWindow } from './module_window.js';
import { ModuleDock } from './module_dock.js';
import { ModuleClock } from './module_clock.js';

export default class VisualTweakExtension extends Extension {

    /**
     * @brief Enable the extension: create modules and connect overview signals
     */
    enable() {
        this._settings = this.getSettings();
        this._idleSourceIds = new Set();

        this._modules = [
            new ModulePanel(this._settings, Main.panel),
            new ModuleWindow(this._settings),
            new ModuleDock(this._settings),
            new ModuleClock(this._settings),
        ];

        for (const module of this._modules) {
            module.enable();
        }

        this._dashOriginalOpacity = null;
        this._dashOriginalReactive = null;
        this._dashDimmed = false;

        this._applyDashDim();

        this._dockShowEnableChangedId = this._settings.connect('changed::dock-show-enable', () => {
            if (this._settings.get_boolean('dock-show-enable')) {
                this._applyDashDim();
            } else {
                this._restoreDash();
            }
        });

        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._onOverviewShowing();
        });

        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            this._addIdle(() => {
                this._onOverviewHidden();
            });
        });
    }

    /**
     * @brief Dim the overview dash when the dock is enabled
     */
    _applyDashDim() {
        if (!this._settings || !this._settings.get_boolean('dock-show-enable')) {
            return;
        }
        if (this._dashDimmed) {
            return;
        }
        try {
            if (Main.overview && Main.overview.dash) {
                const dash = Main.overview.dash;
                this._dashOriginalOpacity = dash.opacity;
                this._dashOriginalReactive = dash.reactive;
                dash.opacity = 0;
                dash.reactive = false;
                this._dashDimmed = true;
            }
        } catch (e) {
            logError(e, 'VisualTweak: dim overview dash failed');
        }
    }

    /**
     * @brief Restore the original overview dash opacity and reactive state
     */
    _restoreDash() {
        if (!this._dashDimmed) {
            return;
        }
        try {
            if (Main.overview && Main.overview.dash) {
                if (this._dashOriginalOpacity !== null) {
                    Main.overview.dash.opacity = this._dashOriginalOpacity;
                }
                if (this._dashOriginalReactive !== null) {
                    Main.overview.dash.reactive = this._dashOriginalReactive;
                }
            }
        } catch (e) {
            logError(e, 'VisualTweak: restore overview dash failed');
        }
        this._dashDimmed = false;
        this._dashOriginalOpacity = null;
        this._dashOriginalReactive = null;
    }

    /**
     * @brief Add a GLib idle source and track its id for removal in disable()
     * @param callback Function to run when the idle source fires
     */
    _addIdle(callback) {
        if (!this._idleSourceIds) {
            return;
        }
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idleSourceIds?.delete(id);
            if (!this._idleSourceIds) {
                return GLib.SOURCE_REMOVE;
            }
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._idleSourceIds.add(id);
    }

    /**
     * @brief Called when the overview is showing
     */
    _onOverviewShowing() {
        if (this._dashDimmed && Main.overview && Main.overview.dash) {
            try {
                Main.overview.dash.opacity = 0;
                Main.overview.dash.reactive = false;
            } catch (e) {}
        }

        for (const module of this._modules) {
            if (typeof module.onOverviewShowing === 'function') {
                module.onOverviewShowing();
            }
        }
    }

    /**
     * @brief Called when the overview is hidden
     */
    _onOverviewHidden() {
        for (const module of this._modules) {
            if (typeof module.onOverviewHidden === 'function') {
                module.onOverviewHidden();
            }
        }
    }

    /**
     * @brief Disable the extension and release all resources
     */
    disable() {
        if (this._dockShowEnableChangedId) {
            this._settings.disconnect(this._dockShowEnableChangedId);
            this._dockShowEnableChangedId = null;
        }

        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = null;
        }

        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = null;
        }

        if (this._idleSourceIds) {
            for (const id of this._idleSourceIds) {
                GLib.Source.remove(id);
            }
            this._idleSourceIds.clear();
            this._idleSourceIds = null;
        }

        for (const module of this._modules) {
            module.disable();
        }

        this._modules = null;

        this._restoreDash();

        this._settings = null;
    }
}
