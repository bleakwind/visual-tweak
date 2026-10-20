/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: extension.js 2026-10-20 12:18:50 Bleakwind Exp $                   |
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
import { ModuleClock } from './module_clock.js';

export default class VisualTweakExtension extends Extension {

    /**
     * @brief Extension entry point, initialize modules and connect overview signals
     */
    enable() {
        this._settings = this.getSettings();
        this._idleSourceIds = new Set();

        this._modules = [
            new ModulePanel(this._settings, Main.panel),
            new ModuleWindow(this._settings),
            new ModuleClock(this._settings),
        ];

        for (const module of this._modules) {
            module.enable();
        }

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
     * @brief Notify all modules that the overview is showing
     */
    _onOverviewShowing() {
        for (const module of this._modules) {
            if (typeof module.onOverviewShowing === 'function') {
                module.onOverviewShowing();
            }
        }
    }

    /**
     * @brief Notify all modules that the overview has hidden
     */
    _onOverviewHidden() {
        for (const module of this._modules) {
            if (typeof module.onOverviewHidden === 'function') {
                module.onOverviewHidden();
            }
        }
    }

    /**
     * @brief Extension cleanup, disconnect overview signals and disable modules
     */
    disable() {
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
        this._settings = null;
    }
}
