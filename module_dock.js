/* vim: set expandtab tabstop=4 softtabstop=4 shiftwidth=4: */
/**
 * +-------------------------------------------------------------------------+
 * | $Id: module_dock.js 2026-10-28 15:01:18 Bleakwind Exp $                 |
 * +-------------------------------------------------------------------------+
 * | Copyright (c) 2008-2026 Bleakwind(Rick Wu).                             |
 * +-------------------------------------------------------------------------+
 * | This source file is module_dock.js.                                     |
 * | This source file is released under BSD license.                         |
 * +-------------------------------------------------------------------------+
 * | Author: Bleakwind(Rick Wu) <bleakwind@qq.com>                           |
 * +-------------------------------------------------------------------------+
 */

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const DOCK_ICON_SIZE_STEPS = [16, 24, 32, 48, 64, 96, 128];
const DOCK_ICON_SIZE_DEFAULT = 48;

const DOCK_HOT_ZONE_HEIGHT = 1;
const DOCK_HOT_ZONE_DELAY = 3000;
const DOCK_HOT_ZONE_SPEED = 800;

const DOCK_LABEL_HIDE_DELAY = 200;
const DOCK_LABEL_FADE_IN = 150;
const DOCK_LABEL_FADE_OUT = 120;
const DOCK_LABEL_EDGE_GAP = 6;

const DOCK_SIZE_EDGE_GAP = 7;
const DOCK_ICON_MAX_DOTS = 5;

const DOCK_HIDE_DELAY_MS = 500;
const DOCK_REFRESH_DEBOUNCE_DELAY = 100;
const DOCK_MINIMIZE_ALL_DELAY = 250;

const MENU_OPEN_THUMB_MAX = 5;
const MENU_OPEN_THUMB_WIDTH = 128;
const MENU_OPEN_THUMB_HEIGHT = 72;
const MENU_OPEN_THUMB_PADDING = 10;

const MENU_OPEN_CLOSEBTN_SIZE = 20;
const MENU_OPEN_LABEL_HEIGHT = 20;
const MENU_OPEN_EMPTY_HEIGHT = 10;

const MENU_CONTENT_PADDING_LR = 10;
const MENU_CONTENT_PADDING_B = 10;
const MENU_CONTENT_ITEM_GAP = 10;
const MENU_CONTENT_ITEM_PADDING = 10;
const MENU_POPUP_BG_COLOR = 'rgb(255,255,255)';
const MENU_POPUP_BOX_SHADOW = '0 4px 12px rgba(0, 0, 0, 0.25)';
const MENU_POPUP_SEPARATOR_COLOR = 'rgba(0, 0, 0, 0.2)';

export class ModuleDock {

    /**
     * @brief Constructor, store settings and init all state fields
     * @param settings GSettings instance
     */
    constructor(settings) {
        this._settings = settings;

        this._dockBox = null;
        this._alignXConstraint = null;
        this._iconActors = new Map();
        this._appInfoMonitorId = null;
        this._favoritesChangedId = null;
        this._shellAppStateId = null;
        this._windowsChangedId = null;
        this._wmDestroyId = null;
        this._windowPositionChangedId = null;
        this._windowSizeChangedId = null;
        this._activeWorkspaceChangedId = null;
        this._mousePollId = null;
        this._dockEnterId = null;
        this._dockLeaveId = null;

        this._layoutIdleId = 0;
        this._updateIconGeometriesIdleId = 0;
        this._iconGeometryUpdates = null;
        this._iconGeometryBatchId = 0;

        this._refreshDockIdleId = 0;

        this._hideTimeoutId = null;
        this._visible = false;

        this._lastY = 0;
        this._lastTime = 0;
        this._isAtBottom = false;
        this._bottomStartX = 0;
        this._hotZoneEnterTime = 0;

        this._settingsShowEnableChangedId = null;
        this._settingsIconSizeChangedId = null;
        this._settingsBgColorChangedId = null;
        this._settingsBgOpacityChangedId = null;

        this._windowCycleHistory = new Map();

        this._shiftClickTimeoutId = 0;
        this._shiftClickAppInfo = null;
        this._shiftClickCursor = new Map();

        this._menu = null;
        this._menuManager = null;
        this._menuIsEmpty = false;
        this._menuTransitioning = false;

        this._menuWindowSignals = new Map();
        this._menuSavedBottom = null;
        this._menuSavedX = null;

        this._dragSourceAppId = null;
        this._dragActive = false;
        this._dragOriginalActor = null;
        this._dragSpace = null;

        this._inOverview = false;

        this._labelActor = null;
        this._labelShowTimeoutId = 0;
        this._labelHideTimeoutId = 0;
        this._labelTargetItem = null;
        this._labelText = '';
        this._showing = false;

        this._hoveredItem = null;
        this._hoveredText = '';

        this._iconSize = DOCK_ICON_SIZE_DEFAULT;
        this._buttonSize = 0;
        this._itemSize = 0;
        this._dockHeight = 0;
        this._updateSizes();

        this._thumbWidth = MENU_OPEN_THUMB_WIDTH;
        this._thumbHeight = MENU_OPEN_THUMB_HEIGHT;
        this._thumbPadding = MENU_OPEN_THUMB_PADDING;
        this._thumbWrapWidth = this._thumbWidth + this._thumbPadding * 2;
        this._thumbWrapHeight = this._thumbHeight + this._thumbPadding * 2;
    }

    /**
     * @brief Enable the dock: create actors, connect signals and build icons
     */
    enable() {
        if (!this._getB('dock-show-enable')) {
            return;
        }

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._createDock();
        this._connectMonitor();
        this._connectMousePoll();

        this._settingsShowEnableChangedId = this._settings.connect('changed::dock-show-enable', () => {
            if (this._getB('dock-show-enable')) {
                if (!this._dockBox) {
                    this._createDock();
                    this._connectMonitor();
                    this._connectMousePoll();
                    this._rebuildIcons();
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        this._syncDockVisibility('settings-enable');
                        return GLib.SOURCE_REMOVE;
                    });
                }
            } else {
                this._destroyDock();
                this._disconnectMonitor();
                this._disconnectMousePoll();
            }
        });

        this._settingsIconSizeChangedId = this._settings.connect('changed::dock-icon-size', () => {
            this._updateSizes();
            if (this._dockBox) {
                this._rebuildIcons();
            }
        });
        this._settingsBgColorChangedId = this._settings.connect('changed::dock-background-color', () => {
            this._applyDockBackground();
        });
        this._settingsBgOpacityChangedId = this._settings.connect('changed::dock-background-opacity', () => {
            this._applyDockBackground();
        });

        this._rebuildIcons();

        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._syncDockVisibility('enable-idle');
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Restart the mouse polling timeout if it stopped unexpectedly
     */
    _ensureMousePoll() {
        if (this._mousePollId) {
            return;
        }
        if (!this._settings || !this._dockBox) {
            return;
        }
        this._connectMousePoll();
    }

    /**
     * @brief Force the LayoutManager to recompute the input region
     */
    _refreshInputRegion() {
        if (!this._dockBox) {
            return;
        }
        try {
            this._dockBox.hide();
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this._dockBox) {
                    try {
                        this._dockBox.show();
                    } catch (e) {
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
        }
    }

    /**
     * @brief Return the currently active workspace
     * @return Meta.Workspace or null
     */
    _getActiveWorkspace() {
        try {
            return global.workspace_manager.get_active_workspace();
        } catch (e) {
            return null;
        }
    }

    /**
     * @brief Return true if the window is on the active workspace
     * @param win Meta.Window to test
     * @return True if on active workspace or sticky
     */
    _isWindowOnActiveWorkspace(win) {
        if (!win) {
            return false;
        }
        try {
            if (win.is_on_all_workspaces()) {
                return true;
            }
            const activeWorkspace = this._getActiveWorkspace();
            if (!activeWorkspace) {
                return true;
            }
            return win.get_workspace() === activeWorkspace;
        } catch (e) {
            return true;
        }
    }

    /**
     * @brief Return taskbar windows of an app on the active workspace
     * @param app The Shell.App to query
     * @return An array of Meta.Window sorted by stable sequence
     */
    _getAppWindowsOnActiveWorkspace(app) {
        const appId = app.get_id();
        const windows = [];
        const tracker = Shell.WindowTracker.get_default();
        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;
            if (!win) {
                continue;
            }
            try {
                if (win.get_window_type() !== Meta.WindowType.NORMAL) {
                    continue;
                }
                if (win.is_skip_taskbar()) {
                    continue;
                }
                if (!this._isWindowOnActiveWorkspace(win)) {
                    continue;
                }
                const winApp = tracker.get_window_app(win);
                if (winApp && winApp.get_id() === appId) {
                    windows.push(win);
                }
            } catch (e) {
            }
        }
        windows.sort((a, b) => {
            try {
                return a.get_stable_sequence() - b.get_stable_sequence();
            } catch (e) {
                return 0;
            }
        });
        return windows;
    }

    /**
     * @brief Lazily create the tooltip label actor
     * @return The St.Label actor used for tooltips
     */
    _ensureLabelActor() {
        if (this._labelActor) {
            return this._labelActor;
        }

        this._labelActor = new St.Label({
            style_class: 'dash-label visual-tweak-dock-label',
            opacity: 0,
            visible: false,
            reactive: false,
        });
        Main.uiGroup.add_child(this._labelActor);
        return this._labelActor;
    }

    /**
     * @brief Show the tooltip label for a dock item
     * @param itemBox The dock item actor
     * @param text The tooltip text
     */
    _showLabelFor(itemBox, text) {
        if (!itemBox || !text) {
            return;
        }

        this._hoveredItem = itemBox;
        this._hoveredText = text;

        if (this._labelTargetItem === itemBox && this._labelActor?.visible) {
            this._cancelLabelHide();
            return;
        }

        if (this._showing) {
            try {
                this._labelActor?.remove_all_transitions();
            } catch (e) {
            }
            this._showing = false;
        }

        this._labelTargetItem = itemBox;
        this._labelText = text;

        this._cancelLabelHide();
        this._cancelLabelShow();

        this._doShowLabel();
    }

    /**
     * @brief Actually show the tooltip label with a fade-in animation
     */
    _doShowLabel() {
        if (!this._labelTargetItem || !this._labelText) {
            return;
        }

        if (this._showing) {
            return;
        }

        const label = this._ensureLabelActor();
        label.set_text(this._labelText);

        label.opacity = 0;
        label.visible = true;

        this._positionLabel();

        this._showing = true;

        label.remove_all_transitions();
        label.ease({
            opacity: 255,
            duration: DOCK_LABEL_FADE_IN,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._showing = false;
            },
        });
    }

    /**
     * @brief Hide the tooltip label with a fade-out animation
     */
    _hideLabel() {
        this._cancelLabelShow();
        this._cancelLabelHide();

        this._showing = false;

        if (!this._labelActor || !this._labelActor.visible) {
            this._labelTargetItem = null;
            this._labelText = '';
            return;
        }

        const label = this._labelActor;
        label.remove_all_transitions();
        label.ease({
            opacity: 0,
            duration: DOCK_LABEL_FADE_OUT,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (label.opacity === 0) {
                    label.visible = false;
                }
            },
        });

        this._labelTargetItem = null;
        this._labelText = '';
    }

    /**
     * @brief Position the tooltip label centered above the target item
     */
    _positionLabel() {
        if (!this._labelActor || !this._labelTargetItem) {
            return;
        }

        const label = this._labelActor;
        const item = this._labelTargetItem;

        if (!item.get_stage()) {
            return;
        }

        label.ensure_style();

        const [minW, natW] = label.get_preferred_width(-1);
        const [minH, natH] = label.get_preferred_height(-1);
        const labelW = Math.max(minW, natW, 1);
        const labelH = Math.max(minH, natH, 1);

        const [itemX, itemY] = item.get_transformed_position();
        const [itemW, itemH] = item.get_transformed_size();

        if (!itemW || !itemH) {
            return;
        }

        const monitor = Main.layoutManager.findMonitorForActor(item);
        const labelX = Math.round(itemX + (itemW - labelW) / 2);
        const labelY = Math.round(itemY - labelH - DOCK_LABEL_EDGE_GAP);

        const minX = monitor.x + 4;
        const maxX = monitor.x + monitor.width - labelW - 4;
        const clampedX = Math.min(Math.max(labelX, minX), maxX);

        label.set_position(clampedX, labelY);
    }

    /**
     * @brief Cancel the pending tooltip show timeout
     */
    _cancelLabelShow() {
        if (this._labelShowTimeoutId) {
            GLib.Source.remove(this._labelShowTimeoutId);
            this._labelShowTimeoutId = 0;
            if (this._showing) {
                this._showing = false;
            }
        }
    }

    /**
     * @brief Cancel the pending tooltip hide timeout
     */
    _cancelLabelHide() {
        if (this._labelHideTimeoutId) {
            GLib.Source.remove(this._labelHideTimeoutId);
            this._labelHideTimeoutId = 0;
        }
    }

    /**
     * @brief Schedule hiding the tooltip after a short delay
     */
    _scheduleLabelHide() {
        this._cancelLabelShow();
        this._cancelLabelHide();
        this._labelHideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, DOCK_LABEL_HIDE_DELAY, () => {
                this._labelHideTimeoutId = 0;
                this._hideLabel();
                return GLib.SOURCE_REMOVE;
            });
    }

    /**
     * @brief Destroy the tooltip label actor and reset all label state
     */
    _destroyLabel() {
        this._cancelLabelShow();
        this._cancelLabelHide();
        this._showing = false;
        if (this._labelActor) {
            try {
                this._labelActor.destroy();
            } catch (e) {
            }
            this._labelActor = null;
        }
        this._labelTargetItem = null;
        this._labelText = '';
        this._hoveredItem = null;
        this._hoveredText = '';
    }

    /**
     * @brief Restore the tooltip for the currently hovered item
     */
    _restoreHoveredLabel() {
        if (this._showing) {
            return;
        }
        if (this._hoveredItem && this._hoveredText) {
            this._showLabelFor(this._hoveredItem, this._hoveredText);
        }
    }

    /**
     * @brief Schedule an idle callback that refreshes the icon geometries
     */
    _scheduleUpdateIconGeometries() {
        if (this._updateIconGeometriesIdleId) {
            return;
        }
        this._updateIconGeometriesIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._updateIconGeometriesIdleId = 0;
            if (!this._dockBox) {
                return GLib.SOURCE_REMOVE;
            }
            try {
                this._collectIconGeometryUpdates();
            } catch (e) {
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Collect all (window, rect) pairs that need an icon geometry update
     */
    _collectIconGeometryUpdates() {
        if (!this._dockBox) {
            return;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return;
        }

        const shownY = monitor.y + monitor.height - this._dockHeight - DOCK_SIZE_EDGE_GAP;

        const tracker = Shell.WindowTracker.get_default();
        const appSystem = Shell.AppSystem.get_default();

        const updates = [];

        for (const [appId, item] of this._iconActors) {
            if (!item || !item.get_stage) {
                continue;
            }

            let iconActor = item;
            for (const c of item.get_children ? item.get_children() : []) {
                let cls = '';
                try {
                    cls = c.style_class || '';
                } catch (e) {
                }
                if (cls === 'dock-bar-appbtn') {
                    iconActor = c;
                    break;
                }
            }

            let x, y, w, h;
            try {
                [x, y] = iconActor.get_transformed_position();
                [w, h] = iconActor.get_transformed_size();
                if (!w || !h) {
                    continue;
                }
            } catch (e) {
                continue;
            }

            const [, dockY] = this._dockBox.get_transformed_position();
            if (Math.abs(dockY - shownY) > 1) {
                y = shownY + (y - dockY);
            }

            let rect;
            try {
                rect = new Mtk.Rectangle({
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(w),
                    height: Math.round(h),
                });
            } catch (e) {
                continue;
            }

            try {
                const app = appSystem.lookup_app(appId);
                if (!app) {
                    continue;
                }
                for (const actor of global.get_window_actors()) {
                    const win = actor.meta_window;
                    if (!win) {
                        continue;
                    }
                    try {
                        if (win.get_compositor_private() !== actor) {
                            continue;
                        }
                    } catch (e) {
                        continue;
                    }
                    if (win.get_window_type() !== Meta.WindowType.NORMAL) {
                        continue;
                    }
                    if (win.is_skip_taskbar()) {
                        continue;
                    }
                    if (!this._isWindowOnActiveWorkspace(win)) {
                        continue;
                    }
                    const winApp = tracker.get_window_app(win);
                    if (winApp && winApp.get_id() === appId) {
                        updates.push({ win, rect });
                    }
                }
            } catch (e) {
            }
        }

        this._iconGeometryUpdates = updates;
        this._scheduleIconGeometryBatch();
    }

    /**
     * @brief Apply the pending icon geometry updates, one per idle frame
     */
    _scheduleIconGeometryBatch() {
        if (this._iconGeometryBatchId) {
            return;
        }
        if (!this._iconGeometryUpdates || this._iconGeometryUpdates.length === 0) {
            return;
        }
        this._iconGeometryBatchId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (!this._iconGeometryUpdates || this._iconGeometryUpdates.length === 0) {
                this._iconGeometryBatchId = 0;
                return GLib.SOURCE_REMOVE;
            }
            const { win, rect } = this._iconGeometryUpdates.shift();
            try {
                win.set_icon_geometry(rect);
            } catch (e) {
            }
            if (this._iconGeometryUpdates.length === 0) {
                this._iconGeometryBatchId = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    /**
     * @brief Called when the overview is showing: keep the dock visible but inert
     */
    onOverviewShowing() {
        this._hideLabel();
        this._inOverview = true;
        this._cancelHide();

        if (!this._dockBox) {
            return;
        }

        this._visible = true;
        this._showing = false;
        this._dockBox.remove_all_transitions();
        this._dockBox.translation_y = 0;
        this._dockBox.opacity = 255;
        this._dockBox.reactive = false;

        this._refreshInputRegion();
        this._ensureMousePoll();
        this._alignToOverviewDash();
    }

    /**
     * @brief Called when the overview is hidden: either keep or hide the dock
     */
    onOverviewHidden() {
        this._inOverview = false;

        if (!this._dockBox) {
            return;
        }

        this._dockBox.reactive = true;
        this._ensureMousePoll();

        const covered = this._isDockAreaCovered('overview-hidden');
        if (!covered) {
            this._cancelHide();
            if (!this._visible) {
                this._showDock('overview-hidden');
            } else if (Math.abs(this._dockBox.translation_y) > 0.5) {
                this._dockBox.translation_y = 0;
                this._refreshInputRegion();
                this._scheduleLayout();
            }
            this._restoreHoveredLabel();
            return;
        }

        const [x, y] = global.get_pointer();
        if (this._pointerInDock(x, y) || this._isMenuOpen()) {
            this._cancelHide();
            this._visible = true;
            this._dockBox.translation_y = 0;
            this._refreshInputRegion();
            this._scheduleLayout();
            this._restoreHoveredLabel();
            return;
        }

        this._scheduleHide('overview-hidden');
        this._scheduleLayout();
    }

    /**
     * @brief Align the dock to the bottom of the screen while the overview is open
     */
    _alignToOverviewDash() {
        if (!this._dockBox) {
            return;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return;
        }

        const targetY = monitor.y + monitor.height - this._dockHeight - DOCK_SIZE_EDGE_GAP;

        try {
            this._dockBox.set_height(this._dockHeight);
            this._dockBox.set_y(targetY);
            this._dockBox.translation_y = 0;
            this._dockBox.queue_relayout();
        } catch (e) {
        }

        if (this._labelActor?.visible) {
            this._positionLabel();
        }

        this._refreshInputRegion();
        this._scheduleUpdateIconGeometries();
    }

    /**
     * @brief Create the dock chrome actor and connect basic signals
     */
    _createDock() {
        if (this._dockBox) {
            return;
        }

        this._dockBox = new St.BoxLayout({
            name: 'visual-tweak-dock-bar',
            style_class: 'visual-tweak-dock-bar',
            reactive: true,
            track_hover: true,
            visible: true,
            x_expand: false,
            y_expand: false,
        });

        this._dragSpace = new DockDragSpace(this);
        this._dockBox._delegate = this._dragSpace;

        Main.layoutManager.addChrome(this._dockBox, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });

        this._dockBox.translation_y = this._dockHeight + DOCK_SIZE_EDGE_GAP;
        this._visible = false;
        this._dockBox.reactive = false;

        this._alignXConstraint = new Clutter.AlignConstraint({
            source: global.stage,
            align_axis: Clutter.AlignAxis.X_AXIS,
            factor: 0.5,
        });
        this._dockBox.add_constraint(this._alignXConstraint);

        this._dockEnterId = this._dockBox.connect('enter-event', () => {
            this._cancelHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._dockLeaveId = this._dockBox.connect('leave-event', () => {
            this._scheduleLabelHide();
            if (this._isMenuOpen()) {
                return Clutter.EVENT_PROPAGATE;
            }
            if (this._inOverview) {
                return Clutter.EVENT_PROPAGATE;
            }
            if (!this._isDockAreaCovered('dock-leave')) {
                this._cancelHide();
                this._visible = true;
                if (Math.abs(this._dockBox.translation_y) > 0.5) {
                    this._dockBox.remove_all_transitions();
                    this._dockBox.translation_y = 0;
                    this._refreshInputRegion();
                    this._scheduleLayout();
                }
                return Clutter.EVENT_PROPAGATE;
            }
            this._scheduleHide('dock-leave');
            return Clutter.EVENT_PROPAGATE;
        });

        this._ensureLabelActor();
        this._applyDockBackground();

        this._refreshInputRegion();
        this._scheduleLayout();
    }

    /**
     * @brief Return true if a context menu is open or in transition
     * @return True when a context menu is open
     */
    _isMenuOpen() {
        if (this._menuTransitioning) {
            return true;
        }
        try {
            return !!(this._menu && this._menu.isOpen);
        } catch (e) {
            return false;
        }
    }

    /**
     * @brief Close and destroy the context menu, releasing all related state
     */
    _closeMenu() {
        this._menuTransitioning = true;

        if (!this._menu) {
            this._menuTransitioning = false;
            return;
        }
        try {
            if (this._menu.isOpen) {
                try {
                    this._menu.close(BoxPointer.PopupAnimation.NONE);
                } catch (e) {
                }
            }
            try {
                if (this._menuManager) {
                    this._menuManager.removeMenu(this._menu);
                }
            } catch (e) {
            }
            try {
                this._menu.destroy();
            } catch (e) {
            }
        } catch (e) {
        }
        this._menu = null;
        this._menuIsEmpty = false;
        this._menuSavedBottom = null;
        this._menuSavedX = null;
        this._clearMenuWindowSignals();

        this._menuTransitioning = false;
    }

    /**
     * @brief Restore the saved bottom position of the menu after an item was removed
     */
    _restoreMenuBottomPos() {
        if (!this._menu || !this._menu.actor || this._menuSavedBottom === null) {
            return;
        }
        try {
            const h = this._menu.actor.height;
            const x = this._menuSavedX !== null ? this._menuSavedX : this._menu.actor.x;
            this._menu.actor.set_position(x, this._menuSavedBottom - h);
        } catch (e) {
        }
    }

    /**
     * @brief Record the current menu position so it can be restored after changes
     */
    _recordMenuPos() {
        try {
            if (this._menu && this._menu.actor) {
                this._menuSavedX = this._menu.actor.x;
                this._menuSavedBottom = this._menu.actor.y + this._menu.actor.height;
            }
        } catch (e) {
        }
    }

    /**
     * @brief Close a window while keeping the context menu open
     * @param win The Meta.Window to close
     * @param title The window title
     */
    _closeWindowAndKeepMenu(win, title) {
        this._recordMenuPos();
        let ok = false;
        try {
            win.delete(global.get_current_time());
            ok = true;
        } catch (e) {
        }
        if (!ok) {
            try {
                win.kill();
            } catch (e) {
            }
        }
    }

    /**
     * @brief Handle a window item being unmanaged inside the context menu
     * @param win The window that was unmanaged
     * @param item The menu item actor
     * @param appInfo The app info of the item
     * @param sourceActor The source actor used to open the menu
     * @param wasThumbnail True if the item was a thumbnail item
     */
    _onWindowItemUnmanaged(win, item, appInfo, sourceActor, wasThumbnail) {
        try {
            item.reactive = false;
            item.hide();
        } catch (e) {
        }
        this._restoreMenuBottomPos();
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._rebuildMenuWindowItems(appInfo, sourceActor, wasThumbnail);
            this._restoreMenuBottomPos();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Rebuild the window-item region of the open context menu in place
     * @param appInfo The Gio.DesktopAppInfo of the owning app
     * @param sourceActor The dock item actor used as the menu source
     * @param wasThumbnail True if the previous items were thumbnails
     */
    _rebuildMenuWindowItems(appInfo, sourceActor, wasThumbnail) {
        if (!this._menu || !this._menu.isOpen) {
            return;
        }

        const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
        const windows = app ? this._getAppWindows(app) : [];
        const nowThumbnail = windows.length > 0 && windows.length <= MENU_OPEN_THUMB_MAX;
        const nowEmpty = windows.length === 0;

        const needRebuild = nowEmpty ? !this._menuIsEmpty : (nowThumbnail !== wasThumbnail);
        if (!needRebuild) {
            return;
        }

        this._clearMenuWindowSignals();
        try {
            this._menu.removeAll();
        } catch (e) {
            return;
        }

        try {
            if (windows.length > 0) {
                const useThumbnails = windows.length <= MENU_OPEN_THUMB_MAX;
                for (const w of windows) {
                    const wi = useThumbnails
                        ? this._createThumbnailWindowItem(w, appInfo, sourceActor)
                        : this._createTextWindowItem(w, appInfo, sourceActor);
                    this._menu.addMenuItem(wi);
                }
                this._menu.addMenuItem(this._createMenuSeparator(MENU_CONTENT_PADDING_B));
                this._menuIsEmpty = false;
            } else {
                this._menu.addMenuItem(this._createEmptyTextRow());
                this._menu.addMenuItem(this._createMenuSeparator());
                this._menuIsEmpty = true;
            }

            const newWindowItem = new PopupMenu.PopupMenuItem(_('New Window'));
            newWindowItem.add_style_class_name('dock-menu-item');
            newWindowItem.connect('activate', () => this._launchNewApp(appInfo));
            this._menu.addMenuItem(newWindowItem);

            const isFavorite = this._isFavorite(appInfo.get_id());
            const pinItem = new PopupMenu.PopupMenuItem(isFavorite ? _('Unpin') : _('Pin'));
            pinItem.add_style_class_name('dock-menu-item');
            pinItem.connect('activate', () => this._toggleFavorite(appInfo));
            this._menu.addMenuItem(pinItem);

            if (app && windows.length > 0) {
                this._menu.addMenuItem(this._createMenuSeparator());

                const quitItem = new PopupMenu.PopupMenuItem(_('Quit'));
                quitItem.add_style_class_name('dock-menu-item');
                quitItem.connect('activate', () => this._quitApp(appInfo));
                this._menu.addMenuItem(quitItem);
            }
        } catch (e) {
            return;
        }

        this._applyMenuBackground(this._menu);
        this._applyMenuSpacing(this._menu);
    }

    /**
     * @brief Resolve the app id of a drag source
     * @param source The drag source object
     * @return The app id or null
     */
    _resolveDragAppId(source) {
        if (!source) {
            return null;
        }
        if (source._appInfo && typeof source._appInfo.get_id === 'function') {
            return source._appInfo.get_id();
        }
        for (const [id, actorItem] of this._iconActors.entries()) {
            if (actorItem === source) {
                return id;
            }
        }
        if (source._itemBox) {
            for (const [id, actorItem] of this._iconActors.entries()) {
                if (actorItem === source._itemBox) {
                    return id;
                }
            }
        }
        return null;
    }

    /**
     * @brief Get the pointer X coordinate in the dock's local coordinate space
     * @return The pointer X coordinate relative to the dock actor
     */
    _getPointerXInDockLocal() {
        if (!this._dockBox) {
            return 0;
        }
        const [px] = global.get_pointer();
        const [dockStageX] = this._dockBox.get_transformed_position();
        return px - dockStageX;
    }

    /**
     * @brief Handle a drag over event on the dock
     * @param source The drag source object
     * @param actor The drag actor
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @param time Event time
     * @return The drag motion result
     */
    _handleDragOver(source, actor, x, y, time) {
        const appId = this._resolveDragAppId(source);
        if (!appId) {
            return DND.DragMotionResult.CONTINUE;
        }

        this._hideLabel();

        this._dragSourceAppId = appId;
        this._dragActive = true;

        const originalActor = this._iconActors.get(appId);
        if (originalActor && originalActor !== this._dragOriginalActor) {
            originalActor.set_opacity(128);
            this._dragOriginalActor = originalActor;
        }

        const localX = this._getPointerXInDockLocal();
        this._updateDragPosition(appId, localX);
        return DND.DragMotionResult.MOVE_DROP;
    }

    /**
     * @brief Handle a drop event on the dock, saving the new order
     * @param source The drag source object
     * @param actor The drag actor
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @param time Event time
     * @return True if the drop was accepted
     */
    _acceptDrop(source, actor, x, y, time) {
        const appId = this._resolveDragAppId(source);

        if (this._dragOriginalActor) {
            this._dragOriginalActor.set_opacity(255);
            this._dragOriginalActor = null;
        }
        if (!appId) {
            this._resetDragState();
            return false;
        }

        const beforeId = this._computeBeforeIdFromLayout(appId);
        this._saveOrderBefore(appId, beforeId);
        this._resetDragState();
        this._rebuildIcons();
        return true;
    }

    /**
     * @brief Move the dragged actor to the position indicated by the mouse X
     * @param appId The app id of the dragged item
     * @param mouseX The pointer X in dock-local coordinates
     */
    _updateDragPosition(appId, mouseX) {
        if (!this._dockBox) {
            return;
        }
        const draggingActor = this._iconActors.get(appId);
        if (!draggingActor) {
            return;
        }

        const children = this._dockBox.get_children();
        const dragPhysIdx = children.indexOf(draggingActor);
        if (dragPhysIdx < 0) {
            return;
        }

        const [dockStageX] = this._dockBox.get_transformed_position();

        if (dragPhysIdx > 0) {
            const leftActor = children[dragPhysIdx - 1];
            if (this._isFavoriteActor(leftActor) && leftActor !== draggingActor) {
                const [lx] = leftActor.get_transformed_position();
                if (mouseX < lx - dockStageX) {
                    this._dockBox.set_child_at_index(draggingActor, dragPhysIdx - 1);
                    return;
                }
            }
        }
        if (dragPhysIdx < children.length - 1) {
            const rightActor = children[dragPhysIdx + 1];
            if (this._isFavoriteActor(rightActor) && rightActor !== draggingActor) {
                const [rx] = rightActor.get_transformed_position();
                const [rw] = rightActor.get_transformed_size();
                if (mouseX > (rx - dockStageX) + rw) {
                    this._dockBox.set_child_at_index(draggingActor, dragPhysIdx + 1);
                    return;
                }
            }
        }
    }

    /**
     * @brief Compute the app id that should be placed after the dragged app
     * @param excludeAppId The app id being dragged
     * @return The app id before which the dragged app should be placed, or null
     */
    _computeBeforeIdFromLayout(excludeAppId) {
        if (!this._dockBox) {
            return null;
        }
        const [dockStageX] = this._dockBox.get_transformed_position();
        const children = this._dockBox.get_children();

        const dragActor = this._iconActors.get(excludeAppId);
        if (!dragActor) {
            return null;
        }
        const [dx] = dragActor.get_transformed_position();
        const dragCenter = (dx - dockStageX) + this._getActorWidth(dragActor) / 2;

        const items = [];
        for (const child of children) {
            if (!this._isFavoriteActor(child)) {
                continue;
            }
            const id = this._getAppIdForActor(child);
            if (!id || id === excludeAppId) {
                continue;
            }
            const [cx] = child.get_transformed_position();
            const [cw] = child.get_transformed_size();
            const left = cx - dockStageX;
            items.push({ appId: id, left, right: left + cw, center: left + cw / 2 });
        }
        items.sort((a, b) => a.left - b.left);

        for (const it of items) {
            if (dragCenter < it.left) {
                return it.appId;
            }
            if (dragCenter <= it.right) {
                return dragCenter <= it.center ? it.appId : null;
            }
        }
        return null;
    }

    /**
     * @brief Get the transformed width of an actor, falling back to item size
     * @param actor The actor to measure
     * @return The transformed width in pixels
     */
    _getActorWidth(actor) {
        try {
            const [, w] = actor.get_transformed_size();
            return w || this._itemSize;
        } catch (e) {
            return this._itemSize;
        }
    }

    /**
     * @brief Save the new favorite order after a drag-and-drop
     * @param appId The app id that was dragged
     * @param beforeId The app id before which it was dropped, or null
     */
    _saveOrderBefore(appId, beforeId) {
        const favoriteIds = this._getFavoriteIds();
        const normalize = (id) => (id || '').toLowerCase().replace(/\.desktop$/, '');
        const target = normalize(appId);

        let removeIndex = -1;
        let actualId = appId;
        for (let i = 0; i < favoriteIds.length; i++) {
            if (normalize(favoriteIds[i]) === target) {
                actualId = favoriteIds[i];
                removeIndex = i;
                break;
            }
        }
        if (removeIndex === -1) {
            return;
        }

        favoriteIds.splice(removeIndex, 1);
        let finalIdx;
        if (beforeId === null) {
            finalIdx = favoriteIds.length;
        } else {
            const beforeNorm = normalize(beforeId);
            finalIdx = favoriteIds.findIndex(id => normalize(id) === beforeNorm);
            if (finalIdx === -1) {
                finalIdx = favoriteIds.length;
            }
        }
        favoriteIds.splice(finalIdx, 0, actualId);

        try {
            const schemaSource = Gio.SettingsSchemaSource.get_default();
            const schema = schemaSource.lookup('org.gnome.shell', true);
            if (schema) {
                const settings = new Gio.Settings({ settings_schema: schema });
                settings.set_strv('favorite-apps', favoriteIds);
            }
        } catch (e) {
        }
    }

    /**
     * @brief Find the app id associated with a dock item actor
     * @param actor The dock item actor
     * @return The app id or null if not found
     */
    _getAppIdForActor(actor) {
        for (const [id, item] of this._iconActors) {
            if (item === actor) {
                return id;
            }
        }
        return null;
    }

    /**
     * @brief Reset the drag state after a drag completes or aborts
     */
    _resetDragState() {
        this._dragActive = false;
        this._dragSourceAppId = null;
    }

    /**
     * @brief Schedule an idle callback that performs the dock layout
     */
    _scheduleLayout() {
        if (this._layoutIdleId) {
            return;
        }
        this._layoutIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._layoutIdleId = 0;
            try {
                this._layoutDock();
            } catch (e) {
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Apply the dock position and translation based on the current state
     */
    _layoutDock() {
        if (!this._dockBox) {
            return;
        }

        if (this._inOverview) {
            this._dockBox.translation_y = 0;
            this._dockBox.queue_relayout();
            if (this._labelActor?.visible && !this._showing) {
                this._positionLabel();
            }
            this._scheduleUpdateIconGeometries();
            return;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return;
        }

        const y = monitor.y + monitor.height - this._dockHeight - DOCK_SIZE_EDGE_GAP;
        const newTy = this._visible ? 0 : (this._dockHeight + DOCK_SIZE_EDGE_GAP);
        this._dockBox.set_height(this._dockHeight);
        this._dockBox.set_y(y);

        if (Math.abs(this._dockBox.translation_y - newTy) > 0.5) {
            this._dockBox.translation_y = newTy;
            this._refreshInputRegion();
        }
        this._dockBox.queue_relayout();

        if (this._labelActor?.visible && !this._showing) {
            this._positionLabel();
        }

        this._scheduleUpdateIconGeometries();
    }

    /**
     * @brief Connect monitor, favorites, app state and window signals
     */
    _connectMonitor() {
        if (!this._appInfoMonitorId) {
            this._appInfoMonitorId = Gio.AppInfoMonitor.get().connect('changed', () => {
                this._scheduleRefreshDockItems();
            });
        }
        if (!this._favoritesChangedId) {
            this._favoritesChangedId = AppFavorites.getAppFavorites().connect('changed', () => {
                this._rebuildIcons();
            });
        }
        if (!this._shellAppStateId) {
            this._shellAppStateId = Shell.AppSystem.get_default().connect('app-state-changed', () => {
                this._scheduleRefreshDockItems();
            });
        }
        if (!this._windowsChangedId) {
            this._windowsChangedId = global.display.connect('window-created', () => {
                this._scheduleRefreshDockItems();
                this._syncDockVisibility('window-created');
            });
            this._wmDestroyId = global.window_manager.connect('kill-window-effects', () => {
                this._scheduleRefreshDockItems();
                this._syncDockVisibility('kill-window-effects');
            });
        }
        if (!this._windowPositionChangedId) {
            try {
                this._windowPositionChangedId = global.display.connect('window-position-changed', () => {
                    this._syncDockVisibility('window-position-changed');
                });
            } catch (e) {
                this._windowPositionChangedId = null;
            }
        }
        if (!this._windowSizeChangedId) {
            try {
                this._windowSizeChangedId = global.display.connect('window-size-changed', () => {
                    this._syncDockVisibility('window-size-changed');
                });
            } catch (e) {
                this._windowSizeChangedId = null;
            }
        }
        if (!this._activeWorkspaceChangedId) {
            try {
                this._activeWorkspaceChangedId = global.workspace_manager.connect('active-workspace-changed', () => {
                    this._shiftClickCursor.clear();
                    this._windowCycleHistory.clear();
                    this._syncDockVisibility('active-workspace-changed');
                    this._scheduleRefreshDockItems();
                });
            } catch (e) {
                this._activeWorkspaceChangedId = null;
            }
        }
    }

    /**
     * @brief Disconnect all monitor, favorites, app state and window signals
     */
    _disconnectMonitor() {
        if (this._appInfoMonitorId) {
            try {
                Gio.AppInfoMonitor.get().disconnect(this._appInfoMonitorId);
            } catch (e) {
            }
            this._appInfoMonitorId = null;
        }
        if (this._favoritesChangedId) {
            try {
                AppFavorites.getAppFavorites().disconnect(this._favoritesChangedId);
            } catch (e) {
            }
            this._favoritesChangedId = null;
        }
        if (this._shellAppStateId) {
            try {
                Shell.AppSystem.get_default().disconnect(this._shellAppStateId);
            } catch (e) {
            }
            this._shellAppStateId = null;
        }
        if (this._windowsChangedId) {
            try {
                global.display.disconnect(this._windowsChangedId);
            } catch (e) {
            }
            this._windowsChangedId = null;
        }
        if (this._wmDestroyId) {
            try {
                global.window_manager.disconnect(this._wmDestroyId);
            } catch (e) {
            }
            this._wmDestroyId = null;
        }
        if (this._windowPositionChangedId) {
            try {
                global.display.disconnect(this._windowPositionChangedId);
            } catch (e) {
            }
            this._windowPositionChangedId = null;
        }
        if (this._windowSizeChangedId) {
            try {
                global.display.disconnect(this._windowSizeChangedId);
            } catch (e) {
            }
            this._windowSizeChangedId = null;
        }
        if (this._activeWorkspaceChangedId) {
            try {
                global.workspace_manager.disconnect(this._activeWorkspaceChangedId);
            } catch (e) {
            }
            this._activeWorkspaceChangedId = null;
        }
    }

    /**
     * @brief Debounce a refresh of the dock items
     */
    _scheduleRefreshDockItems() {
        if (this._refreshDockIdleId) {
            return;
        }
        this._refreshDockIdleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DOCK_REFRESH_DEBOUNCE_DELAY, () => {
            this._refreshDockIdleId = 0;
            if (!this._settings) {
                return GLib.SOURCE_REMOVE;
            }
            this._refreshDockItems();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Cancel a pending debounced refresh of the dock items
     */
    _cancelRefreshDockItems() {
        if (this._refreshDockIdleId) {
            GLib.Source.remove(this._refreshDockIdleId);
            this._refreshDockIdleId = 0;
        }
    }

    /**
     * @brief Start the 16 ms mouse polling timeout
     */
    _connectMousePoll() {
        if (this._mousePollId) {
            return;
        }
        this._mousePollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            try {
                return this._mousePollTick();
            } catch (e) {
                return GLib.SOURCE_CONTINUE;
            }
        });
    }

    /**
     * @brief Return true if any window covers the dock's screen area
     * @param reason Optional reason string for logging
     * @return True if the dock area is covered by a window
     */
    _isDockAreaCovered(reason = '') {
        if (!this._dockBox) {
            return false;
        }

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return false;
        }

        const dockTop = monitor.y + monitor.height - this._dockHeight - DOCK_SIZE_EDGE_GAP;
        const dockBottom = monitor.y + monitor.height;
        const dockLeft = monitor.x;
        const dockRight = monitor.x + monitor.width;

        const activeWorkspace = this._getActiveWorkspace();

        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;
            if (!win) {
                continue;
            }
            try {
                if (win.get_window_type() !== Meta.WindowType.NORMAL) {
                    continue;
                }
                if (win.is_skip_taskbar()) {
                    continue;
                }
                if (win.minimized) {
                    continue;
                }
                if (activeWorkspace && !win.is_on_all_workspaces()) {
                    const winWs = win.get_workspace();
                    if (winWs && winWs !== activeWorkspace) {
                        continue;
                    }
                }
            } catch (e) {
                continue;
            }

            let frame;
            try {
                frame = win.get_frame_rect();
            } catch (e) {
                continue;
            }
            if (!frame || frame.width <= 0 || frame.height <= 0) {
                continue;
            }

            const overlapX = Math.min(frame.x + frame.width, dockRight) - Math.max(frame.x, dockLeft);
            const overlapY = Math.min(frame.y + frame.height, dockBottom) - Math.max(frame.y, dockTop);
            if (overlapX > 0 && overlapY > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * @brief Sync dock visibility with the current occlusion state
     * @param reason Short tag describing the caller, for logging
     */
    _syncDockVisibility(reason = '') {
        if (!this._dockBox || !this._settings) {
            return;
        }
        if (this._inOverview) {
            return;
        }
        if (!this._getB('dock-show-enable')) {
            return;
        }
        if (!Main.layoutManager.primaryMonitor) {
            return;
        }

        const covered = this._isDockAreaCovered(`sync:${reason}`);

        if (!covered) {
            this._cancelHide();
            if (!this._visible) {
                this._showDock(`sync:${reason}`);
            } else {
                this._dockBox.reactive = true;
                if (Math.abs(this._dockBox.translation_y) > 0.5) {
                    this._dockBox.remove_all_transitions();
                    this._dockBox.translation_y = 0;
                    this._refreshInputRegion();
                    this._scheduleLayout();
                }
            }
        } else {
            const [x, y] = global.get_pointer();
            if (!this._pointerInDock(x, y) && !this._isMenuOpen() && !this._dragActive) {
                this._scheduleHide(`sync:${reason}`);
            }
        }
    }

    /**
     * @brief Single tick of the mouse polling loop
     * @return GLib.SOURCE_CONTINUE to keep polling
     */
    _mousePollTick() {
        if (!this._settings) {
            this._mousePollId = null;
            return GLib.SOURCE_REMOVE;
        }
        if (!this._dockBox) {
            return GLib.SOURCE_CONTINUE;
        }

        if (this._inOverview) {
            return GLib.SOURCE_CONTINUE;
        }

        if (Main.overview.visible || !this._getB('dock-show-enable')) {
            return GLib.SOURCE_CONTINUE;
        }
        if (this._isMenuOpen()) {
            this._cancelHide();
            return GLib.SOURCE_CONTINUE;
        }

        this._syncDockVisibility('tick');

        const [x, y] = global.get_pointer();
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            return GLib.SOURCE_CONTINUE;
        }

        const now = GLib.get_monotonic_time();
        const deltaY = y - this._lastY;
        const deltaTime = (now - this._lastTime) / 1000000.0;
        let velocity = 0;
        if (deltaTime > 0 && deltaY > 0) {
            velocity = deltaY / deltaTime;
        }
        this._lastY = y; this._lastTime = now;

        const inHotZone = y >= monitor.y + monitor.height - DOCK_HOT_ZONE_HEIGHT;
        const inDockArea = this._pointerInDock(x, y);
        const horizontalTriggerDist = monitor.width / 10;

        if (inDockArea) {
            this._cancelHide();
            this._isAtBottom = false;
            this._hotZoneEnterTime = 0;
        } else if (inHotZone && !this._visible) {
            if (this._hotZoneEnterTime === 0) {
                this._hotZoneEnterTime = now;
            } else if ((now - this._hotZoneEnterTime) / 1000 >= DOCK_HOT_ZONE_DELAY) {
                this._showDock('hot-dwell');
                this._isAtBottom = false;
                this._hotZoneEnterTime = 0;
                return GLib.SOURCE_CONTINUE;
            }

            if (velocity > DOCK_HOT_ZONE_SPEED) {
                this._showDock('hot-speed');
                this._isAtBottom = false;
                this._hotZoneEnterTime = 0;
            } else {
                if (!this._isAtBottom) {
                    this._isAtBottom = true;
                    this._bottomStartX = x;
                } else if (Math.abs(x - this._bottomStartX) >= horizontalTriggerDist) {
                    this._showDock('hot-horizontal');
                    this._isAtBottom = false;
                    this._hotZoneEnterTime = 0;
                }
            }
        } else if (!inHotZone && !inDockArea) {
            this._isAtBottom = false;
            this._hotZoneEnterTime = 0;
            if (this._isDockAreaCovered('tick-hidecheck')) {
                if (this._visible) {
                    this._scheduleHide('tick');
                }
            } else {
                this._cancelHide();
                if (!this._visible) {
                    this._showDock('tick-autoshow');
                }
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    /**
     * @brief Stop the mouse polling timeout
     */
    _disconnectMousePoll() {
        if (this._mousePollId) {
            GLib.Source.remove(this._mousePollId);
            this._mousePollId = null;
        }
    }

    /**
     * @brief Return true if the pointer is inside the visible dock area or the open menu
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @return True if the pointer is inside the dock or menu area
     */
    _pointerInDock(x, y) {
        if (this._dockBox && this._visible) {
            const [bx, by] = this._dockBox.get_transformed_position();

            const monitor = Main.layoutManager.findMonitorForActor(this._dockBox);
            if (monitor) {
                const topY = by;
                const bottomY = monitor.y + monitor.height;
                const leftX = monitor.x;
                const rightX = monitor.x + monitor.width;

                if (x >= leftX && x <= rightX && y >= topY && y <= bottomY) {
                    return true;
                }
            }
        }

        if (this._menu && this._menu.actor) {
            try {
                const [mx, my] = this._menu.actor.get_transformed_position();
                const [mw, mh] = this._menu.actor.get_transformed_size();
                if (mw > 0 && mh > 0 &&
                    x >= mx && x <= mx + mw && y >= my && y <= my + mh) {
                    return true;
                }
            } catch (e) {
            }
        }

        return false;
    }

    /**
     * @brief Schedule hiding the dock after the configured delay
     * @param reason Short tag describing the caller, for logging
     */
    _scheduleHide(reason = '') {
        if (this._inOverview) {
            return;
        }
        if (this._isMenuOpen()) {
            return;
        }
        if (!this._visible || this._hideTimeoutId || this._dragActive) {
            return;
        }
        if (!this._isDockAreaCovered(`scheduleHide-entry:${reason}`)) {
            return;
        }
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DOCK_HIDE_DELAY_MS, () => {
            this._hideTimeoutId = null;
            if (this._inOverview) {
                return GLib.SOURCE_REMOVE;
            }
            if (this._isMenuOpen()) {
                return GLib.SOURCE_REMOVE;
            }
            const [x, y] = global.get_pointer();
            if (this._pointerInDock(x, y) || this._dragActive) {
                return GLib.SOURCE_REMOVE;
            }
            if (!this._isDockAreaCovered(`scheduleHide-timeout:${reason}`)) {
                return GLib.SOURCE_REMOVE;
            }
            this._hideDock(`timeout:${reason}`);
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Cancel a pending dock hide timeout
     */
    _cancelHide() {
        if (this._hideTimeoutId) {
            GLib.Source.remove(this._hideTimeoutId);
            this._hideTimeoutId = null;
        }
    }

    /**
     * @brief Show the dock immediately without animation
     * @param reason Short tag describing the caller, for logging
     */
    _showDock(reason = '') {
        if (!this._dockBox || this._visible) {
            return;
        }

        this._hideLabel();

        this._visible = true;
        try {
            this._dockBox.reactive = true;
        } catch (e) {
        }

        this._ensureMousePoll();

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) {
            this._visible = false;
            this._dockBox.translation_y = this._dockHeight + DOCK_SIZE_EDGE_GAP;
            try {
                this._dockBox.reactive = false;
            } catch (e) {
            }
            this._refreshInputRegion();
            return;
        }

        this._dockBox.remove_all_transitions();
        this._dockBox.translation_y = 0;
        this._dockBox.queue_relayout();
        this._refreshInputRegion();

        this._scheduleUpdateIconGeometries();
        this._restoreHoveredLabel();
        this._ensureMousePoll();
    }

    /**
     * @brief Hide the dock immediately without animation
     * @param reason Short tag describing the caller, for logging
     */
    _hideDock(reason = '') {
        this._cancelHide();
        this._hideLabel();
        if (!this._dockBox || !this._visible) {
            return;
        }
        if (this._isMenuOpen()) {
            return;
        }
        if (this._inOverview) {
            return;
        }
        if (!this._isDockAreaCovered(`hideDock:${reason}`)) {
            return;
        }
        this._visible = false;
        try {
            this._dockBox.reactive = false;
        } catch (e) {
        }

        const endTy = this._dockHeight + DOCK_SIZE_EDGE_GAP;

        this._dockBox.remove_all_transitions();
        this._dockBox.translation_y = endTy;
        this._dockBox.queue_relayout();
        this._refreshInputRegion();

        this._scheduleLayout();
        this._scheduleUpdateIconGeometries();
        this._ensureMousePoll();
    }

    /**
     * @brief Create the separator actor used between favorites and running apps
     * @return A new St.Widget used as the run separator
     */
    _createRunSeparator() {
        return new St.Widget({
            style_class: 'dock-bar-separator dock-bar-separator-run',
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
    }

    /**
     * @brief Return the run separator actor if present, otherwise null
     * @return The run separator actor or null
     */
    _getRunSeparator() {
        if (!this._dockBox) {
            return null;
        }
        for (const c of this._dockBox.get_children()) {
            try {
                if (c.has_style_class_name && c.has_style_class_name('dock-bar-separator-run')) {
                    return c;
                }
            } catch (e) {
            }
        }
        return null;
    }

    /**
     * @brief Rebuild all dock icons from the current favorites and running apps
     */
    _rebuildIcons() {
        if (!this._dockBox) {
            return;
        }
        this._hideLabel();
        this._resetDragState();

        for (const child of [...this._dockBox.get_children()]) {
            child.destroy();
        }
        this._iconActors.clear();

        const showAppsBtn = this._createShowAppsButton();
        this._dockBox.add_child(showAppsBtn);

        const sep = new St.Widget({ style_class: 'dock-bar-separator', y_expand: true, x_align: Clutter.ActorAlign.CENTER });
        this._dockBox.add_child(sep);

        const favorites = this._collectFavorites();
        const favoriteIds = new Set(favorites.map(info => info.get_id()));
        for (const appInfo of favorites) {
            const item = this._createDockItem(appInfo);
            this._dockBox.add_child(item);
            this._iconActors.set(appInfo.get_id(), item);
        }

        const runningApps = Shell.AppSystem.get_default().get_running();
        const unpinnedRunning = [];
        for (const app of runningApps) {
            const info = app.get_app_info() || Gio.DesktopAppInfo.new(app.get_id());
            if (info && !favoriteIds.has(info.get_id())) {
                unpinnedRunning.push(info);
            }
        }

        if (unpinnedRunning.length > 0) {
            this._dockBox.add_child(this._createRunSeparator());
        }

        for (const info of unpinnedRunning) {
            const item = this._createDockItem(info);
            this._dockBox.add_child(item);
            this._iconActors.set(info.get_id(), item);
        }

        this._scheduleLayout();
        this._scheduleUpdateIconGeometries();
        this._refreshInputRegion();
    }

    /**
     * @brief Incrementally refresh the dock items without destroying everything
     */
    _refreshDockItems() {
        if (!this._dockBox) {
            return;
        }
        if (this._isMenuOpen()) {
            return;
        }

        const appSystem = Shell.AppSystem.get_default();
        const favorites = this._collectFavorites();
        const favoriteIds = new Set(favorites.map(info => info.get_id()));
        const runningIds = new Set(appSystem.get_running().map(a => a.get_id()));

        for (const [appId, itemBox] of [...this._iconActors]) {
            const isRunning = runningIds.has(appId);
            const isFavorite = favoriteIds.has(appId);

            if (!isRunning && !isFavorite) {
                this._iconActors.delete(appId);
                try {
                    itemBox.destroy();
                } catch (e) {
                }
                continue;
            }

            this._refreshDockItem(appId, itemBox);
        }

        const unpinnedRunning = [];
        for (const app of appSystem.get_running()) {
            const appId = app.get_id();
            if (favoriteIds.has(appId)) {
                continue;
            }
            const info = app.get_app_info() || Gio.DesktopAppInfo.new(appId);
            if (info) {
                unpinnedRunning.push(info);
            }
        }

        const runSep = this._getRunSeparator();
        if (unpinnedRunning.length > 0 && !runSep) {
            this._dockBox.add_child(this._createRunSeparator());
        } else if (unpinnedRunning.length === 0 && runSep) {
            try {
                runSep.destroy();
            } catch (e) {
            }
        }

        for (const info of unpinnedRunning) {
            const appId = info.get_id();
            if (this._iconActors.has(appId)) {
                continue;
            }
            const item = this._createDockItem(info);
            this._dockBox.add_child(item);
            this._iconActors.set(appId, item);
        }

        this._scheduleLayout();
        this._scheduleUpdateIconGeometries();
        this._refreshInputRegion();
    }

    /**
     * @brief Update the running dots and opacity of a single dock item
     * @param appId The app id of the item
     * @param itemBox The item actor to update
     */
    _refreshDockItem(appId, itemBox) {
        if (!itemBox || !itemBox.get_children) {
            return;
        }
        const app = Shell.AppSystem.get_default().lookup_app(appId);
        const windows = app ? this._getAppWindows(app) : [];

        let dotBox = null;
        let button = null;
        for (const c of itemBox.get_children()) {
            let cls = '';
            try {
                cls = c.style_class || '';
            } catch (e) {
            }
            if (cls === 'dock-bar-dotbox') {
                dotBox = c;
            }
            if (cls === 'dock-bar-appbtn') {
                button = c;
            }
        }

        if (dotBox) {
            for (const dot of [...dotBox.get_children()]) {
                dot.destroy();
            }
            const numDots = Math.min(windows.length, DOCK_ICON_MAX_DOTS);
            for (let i = 0; i < numDots; i++) {
                dotBox.add_child(new St.Widget({ style_class: 'dock-bar-dotlist', y_align: Clutter.ActorAlign.CENTER }));
            }
            const dotWidth = numDots > 0 ? (numDots * 4 + (numDots - 1) * 3) : 0;
            const dotX = Math.floor((this._itemSize - dotWidth) / 2);
            dotBox.set_position(dotX, this._itemSize - 6);
            dotBox.set_width(dotWidth > 0 ? dotWidth : 1);
            dotBox.set_height(4);
        }

        if (button) {
            if (windows.length === 0 && !this._isFavorite(appId)) {
                button.set_opacity(128);
            } else {
                button.set_opacity(255);
            }
        }
    }

    /**
     * @brief Create the "Show Apps" button shown at the left of the dock
     * @return A new St.Button for the Show Apps action
     */
    _createShowAppsButton() {
        const button = new St.Button({
            style_class: 'dock-bar-sabtn', reactive: true, track_hover: true, can_focus: true,
            width: this._itemSize, height: this._itemSize,
        });
        const icon = new St.Icon({ icon_name: 'view-app-grid-symbolic', icon_size: Math.max(1, this._iconSize - 10), style_class: 'dock-bar-saico' });
        button.set_child(icon);

        button.connect('clicked', () => {
            if (Main.overview.visible) {
                Main.overview.hide();
            } else {
                Main.overview.showApps();
            }
        });

        const label = _('Show Apps');
        button.connect('enter-event', () => {
            if (this._dragActive) {
                return Clutter.EVENT_PROPAGATE;
            }
            this._showLabelFor(button, label);
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('leave-event', () => {
            this._scheduleLabelHide();
            return Clutter.EVENT_PROPAGATE;
        });
        button.connect('button-press-event', () => {
            this._hideLabel();
            return Clutter.EVENT_PROPAGATE;
        });

        return button;
    }

    /**
     * @brief Create a single dock item (icon, button, dots) for an app
     * @param appInfo The Gio.DesktopAppInfo of the app
     * @return A new St.Widget representing the dock item
     */
    _createDockItem(appInfo) {
        const itemSize = this._itemSize;

        const itemBox = new St.Widget({
            style_class: 'dock-bar-itembox', reactive: true, track_hover: true,
            width: itemSize, height: itemSize, y_align: Clutter.ActorAlign.CENTER,
        });

        const button = new St.Button({
            style_class: 'dock-bar-appbtn', reactive: false, can_focus: false,
            width: itemSize, height: itemSize,
        });

        let gicon = appInfo.get_icon();
        if (!gicon) {
            gicon = new Gio.ThemedIcon({ name: 'application-x-executable' });
        }
        const icon = new St.Icon({ gicon: gicon, icon_size: this._iconSize, style_class: 'dock-bar-appico' });
        button.set_child(icon);
        button.set_position(0, 0);
        button.set_size(itemSize, itemSize);

        const agent = new DockDragAgent(this, itemBox, appInfo);
        itemBox._delegate = agent;
        DND.makeDraggable(itemBox, { restoreOnSuccess: true });

        const appName = appInfo.get_name?.() ?? appInfo.get_name;
        itemBox.connect('enter-event', () => {
            if (this._dragActive) {
                return Clutter.EVENT_PROPAGATE;
            }
            this._showLabelFor(itemBox, appName);
            return Clutter.EVENT_PROPAGATE;
        });
        itemBox.connect('leave-event', () => {
            this._scheduleLabelHide();
            return Clutter.EVENT_PROPAGATE;
        });

        let isPressing = false;
        let pressButton = 0;
        itemBox.connect('button-press-event', (actor, event) => {
            const btn = event.get_button();
            if (btn !== 1 && btn !== 2 && btn !== 3) {
                return Clutter.EVENT_PROPAGATE;
            }
            this._hideLabel();
            isPressing = true;
            pressButton = btn;
            return Clutter.EVENT_PROPAGATE;
        });

        itemBox.connect('button-release-event', (actor, event) => {
            const wasPressing = isPressing;
            const pressedBtn = pressButton;
            isPressing = false; pressButton = 0;
            const buttonNumber = event.get_button();

            if (this._dragActive) {
                return Clutter.EVENT_STOP;
            }
            if (!wasPressing || buttonNumber !== pressedBtn) {
                return Clutter.EVENT_PROPAGATE;
            }

            if (buttonNumber === 3) {
                try {
                    this._showContextMenu(appInfo, itemBox);
                } catch (e) {
                }
                return Clutter.EVENT_STOP;
            }
            if (buttonNumber === 2) {
                try {
                    const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
                    let canOpenNew = false;
                    if (app) {
                        try {
                            canOpenNew = app.can_open_new_window();
                        } catch (e) {
                        }
                    }

                    if (Main.overview.visible) {
                        Main.overview.hide();
                    }

                    if (app && canOpenNew) {
                        this._launchNewApp(appInfo);
                    } else if (app) {
                        const windows = this._getAppWindowsOnActiveWorkspace(app);
                        if (windows.length > 0) {
                            try {
                                Main.activateWindow(windows[0]);
                            } catch (e) {
                                app.activate();
                            }
                        } else {
                            app.activate();
                        }
                    } else {
                        this._launchNewApp(appInfo);
                    }
                } catch (e) {
                }
                return Clutter.EVENT_STOP;
            }
            if (buttonNumber !== 1) {
                return Clutter.EVENT_PROPAGATE;
            }

            const state = event.get_state();
            const isShift = (state & Clutter.ModifierType.SHIFT_MASK) !== 0;
            if (isShift) {
                this._handleShiftClick(appInfo);
            } else {
                this._cancelShiftClick();
                if (Main.overview.visible) {
                    Main.overview.hide();
                }
                this._launchApp(appInfo);
            }
            return Clutter.EVENT_STOP;
        });

        let windowCount = 0;
        try {
            const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
            if (app) {
                windowCount = this._getAppWindows(app).length;
            }
        } catch (e) {
        }
        const numDots = Math.min(windowCount, DOCK_ICON_MAX_DOTS);
        const dotBox = new St.BoxLayout({ style_class: 'dock-bar-dotbox', reactive: false });
        for (let i = 0; i < numDots; i++) {
            dotBox.add_child(new St.Widget({ style_class: 'dock-bar-dotlist', y_align: Clutter.ActorAlign.CENTER }));
        }
        const dotWidth = numDots > 0 ? (numDots * 4 + (numDots - 1) * 3) : 0;
        const dotX = Math.floor((itemSize - dotWidth) / 2);
        dotBox.set_position(dotX, itemSize - 6);
        dotBox.set_width(dotWidth > 0 ? dotWidth : 1);
        dotBox.set_height(4);
        dotBox.set_z_position(1);

        itemBox.add_child(button);
        itemBox.add_child(dotBox);
        return itemBox;
    }

    /**
     * @brief Return true if the given dock item actor corresponds to a favorite app
     * @param actor The dock item actor
     * @return True if the app is a favorite
     */
    _isFavoriteActor(actor) {
        for (const [appId, item] of this._iconActors) {
            if (item === actor) {
                return this._isFavorite(appId);
            }
        }
        return false;
    }

    /**
     * @brief Return the list of favorite app infos in the current order
     * @return An array of Gio.DesktopAppInfo
     */
    _collectFavorites() {
        const result = [];
        let favoriteIds = [];
        try {
            const schemaSource = Gio.SettingsSchemaSource.get_default();
            const schema = schemaSource.lookup('org.gnome.shell', true);
            if (schema) {
                const settings = new Gio.Settings({ settings_schema: schema });
                favoriteIds = settings.get_strv('favorite-apps');
            }
        } catch (e) {
        }
        if (!favoriteIds || favoriteIds.length === 0) {
            try {
                favoriteIds = AppFavorites.getAppFavorites().getFavorites();
            } catch (e) {
            }
        }
        for (const id of favoriteIds) {
            try {
                const app = Shell.AppSystem.get_default().lookup_app(id);
                if (app) {
                    let info = app.get_app_info();
                    if (!info) {
                        info = Gio.DesktopAppInfo.new(id);
                    }
                    if (info) {
                        result.push(info);
                    }
                }
            } catch (e) {
            }
        }
        return result;
    }

    /**
     * @brief Return the list of normal, taskbar-visible windows of an app
     * @param app The Shell.App to query
     * @return An array of Meta.Window
     */
    _getAppWindows(app) {
        const appId = app.get_id();
        const windows = [];
        const tracker = Shell.WindowTracker.get_default();
        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;
            if (!win) {
                continue;
            }
            try {
                if (win.get_window_type() !== Meta.WindowType.NORMAL) {
                    continue;
                }
                if (win.is_skip_taskbar()) {
                    continue;
                }
                const winApp = tracker.get_window_app(win);
                if (winApp && winApp.get_id() === appId) {
                    windows.push(win);
                }
            } catch (e) {
            }
        }
        windows.sort((a, b) => {
            try {
                return a.get_stable_sequence() - b.get_stable_sequence();
            } catch (e) {
                return 0;
            }
        });
        return windows;
    }

    /**
     * @brief Create a separator menu item
     * @param topMargin Top margin in pixels
     * @return A new PopupBaseMenuItem used as a separator
     */
    _createMenuSeparator(topMargin = 4) {
        const sep = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        sep.set_style(`padding: 0; margin: ${topMargin}px 0 4px 0; min-height: 1px;`);
        sep.x_expand = true;
        const line = new St.Widget({
            style: `background-color: ${MENU_POPUP_SEPARATOR_COLOR};`,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        line.set_height(1);
        sep.add_child(line);
        return sep;
    }

    /**
     * @brief Create an empty placeholder menu item for apps without windows
     * @return A new non-reactive PopupBaseMenuItem
     */
    _createEmptyTextRow() {
        const emptyLabelWidth = MENU_OPEN_THUMB_WIDTH + 40;

        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        item.add_style_class_name('dock-menu-winlist');
        try {
            item.set_style(
                `background-color: transparent; ` +
                `height: ${MENU_OPEN_EMPTY_HEIGHT}px; ` +
                `padding: 0; margin: 0; margin-top: ${MENU_CONTENT_ITEM_GAP}px;`
            );
        } catch (e) {
        }

        try {
            item.x_expand = false;
            item.x_align = Clutter.ActorAlign.START;
        } catch (e) {
        }

        const hbox = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            height: MENU_OPEN_EMPTY_HEIGHT,
            style: `background-color: transparent; height: ${MENU_OPEN_EMPTY_HEIGHT}px; padding: 0;`,
        });

        const label = new St.Label({
            text: '',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            height: MENU_OPEN_EMPTY_HEIGHT,
            style: `background-color: transparent; height: ${MENU_OPEN_EMPTY_HEIGHT}px; font-size: 0.85em; ` +
                `min-width: ${emptyLabelWidth}px; max-width: ${emptyLabelWidth}px;`,
        });
        try {
            label.set_width(emptyLabelWidth);
            label.set_height(MENU_OPEN_EMPTY_HEIGHT);
            label.y_expand = true;
            if (label.clutter_text) {
                label.clutter_text.y_align = Clutter.ActorAlign.CENTER;
                label.clutter_text.y_expand = true;
            }
        } catch (e) {
        }

        hbox.add_child(label);
        item.add_child(hbox);

        try {
            const innerChildren = item.get_children ? item.get_children() : [];
            for (const ic of innerChildren) {
                let icCls = '';
                try {
                    icCls = ic.style_class || ic.constructor?.name || '';
                } catch (e) {
                }
                if (icCls === 'St_Bin' || ic instanceof St.Bin) {
                    try {
                        ic.set_style('background-color: transparent;');
                        ic.x_expand = false;
                        ic.x_align = Clutter.ActorAlign.START;
                    } catch (e) {
                    }
                }
            }
        } catch (e) {
        }

        return item;
    }

    /**
     * @brief Open the context menu for a dock item
     * @param appInfo The Gio.DesktopAppInfo of the item
     * @param sourceActor The dock item actor used as the menu source
     */
    _showContextMenu(appInfo, sourceActor) {
        this._hideLabel();

        this._menuTransitioning = true;

        this._clearMenuWindowSignals();

        if (this._menu) {
            try {
                this._menu.destroy();
            } catch (e) {
            }
            this._menu = null;
        }
        this._menuIsEmpty = false;

        const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
        const windows = app ? this._getAppWindows(app) : [];

        let sx = 0, sy = 0, sw = 1, sh = 1;
        let sourceValid = false;
        try {
            if (sourceActor && sourceActor.get_stage && sourceActor.get_stage()) {
                [sx, sy] = sourceActor.get_transformed_position();
                [sw, sh] = sourceActor.get_transformed_size();
                if (!isNaN(sx) && !isNaN(sy) && !isNaN(sw) && !isNaN(sh) && sw > 0 && sh > 0) {
                    sourceValid = true;
                }
            }
        } catch (e) {
        }

        let realSource = sourceActor;
        if (!sourceValid) {
            realSource = this._dockBox;
            try {
                if (realSource) {
                    [sx, sy] = realSource.get_transformed_position();
                    [sw, sh] = realSource.get_transformed_size();
                }
            } catch (e) {
            }
        }

        const menu = new PopupMenu.PopupMenu(realSource, 0.5, St.Side.BOTTOM);
        menu.actor.add_style_class_name('visual-tweak-dock-menu');
        menu.actor.set_style('background-color: transparent; border: none; box-shadow: none;');
        Main.uiGroup.add_child(menu.actor);
        this._menuManager.addMenu(menu);

        try {
            if (windows.length > 0) {
                const useThumbnails = windows.length <= MENU_OPEN_THUMB_MAX;
                for (const win of windows) {
                    const item = useThumbnails
                        ? this._createThumbnailWindowItem(win, appInfo, sourceActor)
                        : this._createTextWindowItem(win, appInfo, sourceActor);
                    menu.addMenuItem(item);
                }
                menu.addMenuItem(this._createMenuSeparator(MENU_CONTENT_PADDING_B));
                this._menuIsEmpty = false;
            } else {
                menu.addMenuItem(this._createEmptyTextRow());
                menu.addMenuItem(this._createMenuSeparator());
                this._menuIsEmpty = true;
            }

            const newWindowItem = new PopupMenu.PopupMenuItem(_('New Window'));
            newWindowItem.add_style_class_name('dock-menu-item');
            newWindowItem.connect('activate', () => this._launchNewApp(appInfo));
            menu.addMenuItem(newWindowItem);

            const isFavorite = this._isFavorite(appInfo.get_id());
            const pinItem = new PopupMenu.PopupMenuItem(isFavorite ? _('Unpin') : _('Pin'));
            pinItem.add_style_class_name('dock-menu-item');
            pinItem.connect('activate', () => this._toggleFavorite(appInfo));
            menu.addMenuItem(pinItem);

            if (app && windows.length > 0) {
                menu.addMenuItem(this._createMenuSeparator());

                const quitItem = new PopupMenu.PopupMenuItem(_('Quit'));
                quitItem.add_style_class_name('dock-menu-item');
                quitItem.connect('activate', () => this._quitApp(appInfo));
                menu.addMenuItem(quitItem);
            }
        } catch (e) {
        }

        menu.connect('open-state-changed', (popupMenu, isOpen) => {
            if (!isOpen) {
                this._clearMenuWindowSignals();
                try {
                    if (this._menuManager) {
                        this._menuManager.removeMenu(popupMenu);
                    }
                } catch (e) {
                }
                try {
                    popupMenu.destroy();
                } catch (e) {
                }
                if (this._menu === popupMenu) {
                    this._menu = null;
                    this._menuIsEmpty = false;
                }
                this._menuSavedBottom = null;
                this._menuSavedX = null;
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (this._dockBox) {
                        this._refreshDockItems();
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

        try {
            menu.open(BoxPointer.PopupAnimation.FULL);
        } catch (e) {
        }

        this._applyMenuBackground(menu);
        this._applyMenuSpacing(menu);

        this._menu = menu;
        this._menuTransitioning = false;

        this._recordMenuPos();
    }

    /**
     * @brief Create a text-only window item for the context menu
     * @param win The Meta.Window represented by the item
     * @param appInfo The Gio.DesktopAppInfo of the owning app
     * @param sourceActor The dock item actor used as the menu source
     * @return A new PopupBaseMenuItem
     */
    _createTextWindowItem(win, appInfo, sourceActor) {
        let title = '';
        try {
            title = win.get_title() || '';
        } catch (e) {
        }
        if (!title) {
            title = _('(Untitled Window)');
        }

        const textLabelWidth = MENU_OPEN_THUMB_WIDTH - 10;

        const item = new PopupMenu.PopupBaseMenuItem({ reactive: true });
        item.add_style_class_name('dock-menu-winlist');
        try {
            item.set_style(
                `padding: 0; margin: 0; margin-top: ${MENU_CONTENT_ITEM_GAP}px;`
            );
        } catch (e) {
        }

        try {
            item.x_expand = false;
            item.x_align = Clutter.ActorAlign.START;
        } catch (e) {
        }

        const hbox = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            style: `padding: ${MENU_CONTENT_ITEM_PADDING}px;`,
        });
        hbox.layout_manager.spacing = MENU_CONTENT_ITEM_GAP;

        const label = new St.Label({
            text: title,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style: `font-size: 0.85em; ` +
                `margin-right: ${MENU_CONTENT_ITEM_GAP}px; min-width: ${textLabelWidth}px; max-width: ${textLabelWidth}px;`,
        });
        try {
            label.ellipsize = Pango.EllipsizeMode.END;
            label.set_width(textLabelWidth);
            label.set_height(MENU_OPEN_LABEL_HEIGHT);
            label.y_expand = true;
            if (label.clutter_text) {
                label.clutter_text.y_align = Clutter.ActorAlign.CENTER;
                label.clutter_text.y_expand = true;
            }
        } catch (e) {
        }

        const closeBtn = new St.Button({
            reactive: true,
            can_focus: false,
            width: MENU_OPEN_CLOSEBTN_SIZE,
            height: MENU_OPEN_CLOSEBTN_SIZE,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'background-color: rgba(0,0,0,0.1); border-radius: 10px;',
        });
        const closeIcon = new St.Icon({
            icon_name: 'window-close-symbolic',
            icon_size: 12,
            style: 'color: #000000;',
        });
        closeBtn.set_child(closeIcon);
        closeBtn.connect('clicked', () => {
            this._closeWindowAndKeepMenu(win, title);
        });

        hbox.add_child(label);
        hbox.add_child(closeBtn);
        item.add_child(hbox);

        try {
            const innerChildren = item.get_children ? item.get_children() : [];
            for (const ic of innerChildren) {
                let icCls = '';
                try {
                    icCls = ic.style_class || ic.constructor?.name || '';
                } catch (e) {
                }
                if (icCls === 'St_Bin' || ic instanceof St.Bin) {
                    try {
                        ic.x_expand = false;
                        ic.x_align = Clutter.ActorAlign.START;
                    } catch (e) {
                    }
                }
            }
        } catch (e) {
        }

        item.connect('activate', () => {
            try {
                win.activate(global.get_current_time());
            } catch (e) {
            }
        });

        try {
            const winId = win.get_id();
            const sigId = win.connect('unmanaged', () => {
                this._menuWindowSignals.delete(winId);
                this._onWindowItemUnmanaged(win, item, appInfo, sourceActor, false);
            });
            this._menuWindowSignals.set(winId, { win, sigId });
        } catch (e) {
        }

        return item;
    }

    /**
     * @brief Apply the flat white background style to the popup menu
     * @param menu The PopupMenu to style
     */
    _applyMenuBackground(menu) {
        if (!menu || !menu.actor) {
            return;
        }
        let children = [];
        try {
            children = menu.actor.get_children ? menu.actor.get_children() : [];
        } catch (e) {
        }
        for (const child of children) {
            let cls = '';
            try {
                cls = child.style_class || child.constructor?.name || '';
            } catch (e) {
            }
            if (cls === 'St_Bin' || child instanceof St.Bin) {
                try {
                    child.set_style('background-color: transparent; border: none; box-shadow: none;');
                } catch (e) {
                }
                let grand = [];
                try {
                    grand = child.get_children ? child.get_children() : [];
                } catch (e) {
                }
                for (const g of grand) {
                    let gCls = '';
                    try {
                        gCls = g.style_class || '';
                    } catch (e) {
                    }
                    if (gCls === 'popup-menu-content') {
                        try {
                            g.set_style(
                                `background-color: ${MENU_POPUP_BG_COLOR}; ` +
                                `border: none; box-shadow: ${MENU_POPUP_BOX_SHADOW}; ` +
                                `padding: 0px ${MENU_CONTENT_PADDING_LR}px ${MENU_CONTENT_PADDING_B}px ${MENU_CONTENT_PADDING_LR}px;`
                            );
                        } catch (e) {
                        }
                    }
                }
            }
        }
    }

    /**
     * @brief Apply spacing to the popup menu content
     * @param menu The PopupMenu to style
     */
    _applyMenuSpacing(menu) {
        if (!menu || !menu.actor) {
            return;
        }
        let children = [];
        try {
            children = menu.actor.get_children ? menu.actor.get_children() : [];
        } catch (e) {
        }
        for (const child of children) {
            let grand = [];
            try {
                grand = child.get_children ? child.get_children() : [];
            } catch (e) {
            }
            for (const g of grand) {
                let gCls = '';
                try {
                    gCls = g.style_class || '';
                } catch (e) {
                }
                if (gCls === 'popup-menu-content') {
                    try {
                        g.set_style(
                            `background-color: ${MENU_POPUP_BG_COLOR}; ` +
                            `border: none; box-shadow: ${MENU_POPUP_BOX_SHADOW}; ` +
                            `padding: 0px ${MENU_CONTENT_PADDING_LR}px ${MENU_CONTENT_PADDING_B}px ${MENU_CONTENT_PADDING_LR}px;`
                        );
                    } catch (e) {
                    }
                }
            }
        }
    }

    /**
     * @brief Create a window item with a live thumbnail for the context menu
     * @param win The Meta.Window represented by the item
     * @param appInfo The Gio.DesktopAppInfo of the owning app
     * @param sourceActor The dock item actor used as the menu source
     * @return A new PopupBaseMenuItem
     */
    _createThumbnailWindowItem(win, appInfo, sourceActor) {
        let title = '';
        try {
            title = win.get_title() || '';
        } catch (e) {
        }
        if (!title) {
            title = _('(Untitled Window)');
        }

        const item = new PopupMenu.PopupBaseMenuItem({ reactive: true });
        item.add_style_class_name('dock-menu-winlist');
        try {
            item.set_style(
                `padding: ${MENU_CONTENT_ITEM_PADDING}px; margin: 0; margin-top: ${MENU_CONTENT_ITEM_GAP}px;`
            );
        } catch (e) {
        }

        try {
            item.x_expand = false;
            item.x_align = Clutter.ActorAlign.START;
        } catch (e) {
        }

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            width: this._thumbWrapWidth,
        });
        box.layout_manager.spacing = 4;

        const thumbWrap = new St.Widget({
            width: this._thumbWrapWidth,
            height: this._thumbWrapHeight,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const thumbBox = new St.Bin({
            width: this._thumbWidth,
            height: this._thumbHeight,
            style: 'background-color: transparent; border-radius: 4px;',
        });
        thumbBox.set_position(this._thumbPadding, this._thumbPadding);
        thumbBox.set_size(this._thumbWidth, this._thumbHeight);

        let clone = null;
        try {
            const compositorActor = win.get_compositor_private();
            if (compositorActor) {
                const frame = win.get_frame_rect();
                if (frame && frame.width > 0 && frame.height > 0) {
                    const scale = Math.min(
                        this._thumbWidth / frame.width,
                        this._thumbHeight / frame.height
                    );
                    const cw = Math.max(1, Math.round(frame.width * scale));
                    const ch = Math.max(1, Math.round(frame.height * scale));
                    clone = new Clutter.Clone({
                        source: compositorActor,
                        width: cw,
                        height: ch,
                    });
                }
            }
        } catch (e) {
        }

        if (clone) {
            thumbBox.set_child(clone);
        } else {
            const phLabel = new St.Label({
                text: _('[No Thumbnail]'),
                style: 'font-size: 0.8em; color: rgba(255,255,255,0.7);',
            });
            thumbBox.set_child(phLabel);
        }

        thumbWrap.add_child(thumbBox);

        const closeBtn = new St.Button({
            reactive: true,
            can_focus: false,
            width: MENU_OPEN_CLOSEBTN_SIZE,
            height: MENU_OPEN_CLOSEBTN_SIZE,
            style: 'background-color: rgba(0,0,0,0.45); border-radius: 10px;',
        });
        const closeIcon = new St.Icon({
            icon_name: 'window-close-symbolic',
            icon_size: 12,
            style: 'color: #ffffff;',
        });
        closeBtn.set_child(closeIcon);
        closeBtn.set_position(
            this._thumbWrapWidth - MENU_OPEN_CLOSEBTN_SIZE - 2,
            2
        );
        closeBtn.set_size(MENU_OPEN_CLOSEBTN_SIZE, MENU_OPEN_CLOSEBTN_SIZE);
        closeBtn.connect('clicked', () => {
            this._closeWindowAndKeepMenu(win, title);
        });
        thumbWrap.add_child(closeBtn);

        const label = new St.Label({
            text: title,
            style: 'font-size: 0.85em; text-align: center;',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        try {
            label.ellipsize = Pango.EllipsizeMode.END;
            label.set_width(this._thumbWrapWidth);
            if (label.clutter_text) {
                label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                label.clutter_text.single_line_mode = true;
                label.clutter_text.line_alignment = Pango.Alignment.CENTER;
                label.clutter_text.x_align = Clutter.ActorAlign.CENTER;
                label.clutter_text.set_width(this._thumbWrapWidth);
            }
        } catch (e) {
        }

        box.add_child(thumbWrap);
        box.add_child(label);
        item.add_child(box);

        try {
            const innerChildren = item.get_children ? item.get_children() : [];
            for (const ic of innerChildren) {
                let icCls = '';
                try {
                    icCls = ic.style_class || ic.constructor?.name || '';
                } catch (e) {
                }
                if (icCls === 'St_Bin' || ic instanceof St.Bin) {
                    try {
                        ic.set_style('background-color: transparent;');
                        ic.x_expand = false;
                        ic.x_align = Clutter.ActorAlign.START;
                    } catch (e) {
                    }
                }
            }
        } catch (e) {
        }

        item.connect('activate', () => {
            try {
                win.activate(global.get_current_time());
            } catch (e) {
            }
        });

        try {
            const winId = win.get_id();
            const sigId = win.connect('unmanaged', () => {
                this._menuWindowSignals.delete(winId);
                this._onWindowItemUnmanaged(win, item, appInfo, sourceActor, true);
            });
            this._menuWindowSignals.set(winId, { win, sigId });
        } catch (e) {
        }

        return item;
    }

    /**
     * @brief Disconnect all window unmanaged signals tracked by the menu
     */
    _clearMenuWindowSignals() {
        if (!this._menuWindowSignals) {
            return;
        }
        for (const [winId, entry] of this._menuWindowSignals) {
            try {
                if (entry && entry.win && entry.sigId) {
                    entry.win.disconnect(entry.sigId);
                }
            } catch (e) {
            }
        }
        this._menuWindowSignals.clear();
        this._menuSavedBottom = null;
        this._menuSavedX = null;
    }

    /**
     * @brief Return the raw favorite app id list from GSettings
     * @return An array of app id strings
     */
    _getFavoriteIds() {
        let favoriteIds = [];
        try {
            const schemaSource = Gio.SettingsSchemaSource.get_default();
            const schema = schemaSource.lookup('org.gnome.shell', true);
            if (schema) {
                const settings = new Gio.Settings({ settings_schema: schema });
                favoriteIds = settings.get_strv('favorite-apps');
            }
        } catch (e) {
        }
        if (!favoriteIds || favoriteIds.length === 0) {
            try {
                favoriteIds = AppFavorites.getAppFavorites().getFavorites();
            } catch (e) {
            }
        }
        return favoriteIds;
    }

    /**
     * @brief Return true if the given app id is in the favorites list
     * @param appId The app id to test
     * @return True if the app is a favorite
     */
    _isFavorite(appId) {
        if (!appId) {
            return false;
        }
        const favoriteIds = this._getFavoriteIds();
        const normalize = (id) => (id || '').toLowerCase().replace(/\.desktop$/, '');
        const normalizedId = normalize(appId);
        for (const favId of favoriteIds) {
            if (normalize(favId) === normalizedId) {
                return true;
            }
        }
        return false;
    }

    /**
     * @brief Toggle the favorite state of an app
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _toggleFavorite(appInfo) {
        const appId = appInfo.get_id();
        try {
            const favorites = AppFavorites.getAppFavorites();
            if (this._isFavorite(appId)) {
                favorites.removeFavorite(appId);
            } else {
                favorites.addFavorite(appId);
            }
            this._rebuildIcons();
        } catch (e) {
        }
    }

    /**
     * @brief Quit an app by closing all its windows
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _quitApp(appInfo) {
        try {
            const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
            if (!app) {
                return;
            }
            const windows = this._getAppWindows(app);
            for (const win of windows) {
                try {
                    win.delete(global.get_current_time());
                } catch (e) {
                }
            }
        } catch (e) {
        }
    }

    /**
     * @brief Handle a shift-click on a dock item
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _handleShiftClick(appInfo) {
        if (this._shiftClickTimeoutId) {
            GLib.Source.remove(this._shiftClickTimeoutId);
            this._shiftClickTimeoutId = 0;
            this._shiftClickAppInfo = null;
            this._minimizeAllOnActiveWorkspace(appInfo);
            return;
        }
        this._shiftClickAppInfo = appInfo;
        this._shiftClickTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DOCK_MINIMIZE_ALL_DELAY, () => {
            this._shiftClickTimeoutId = 0;
            const targetAppInfo = this._shiftClickAppInfo;
            this._shiftClickAppInfo = null;
            if (targetAppInfo) {
                this._minimizeOneByCursor(targetAppInfo);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * @brief Cancel a pending shift-click action
     */
    _cancelShiftClick() {
        if (this._shiftClickTimeoutId) {
            GLib.Source.remove(this._shiftClickTimeoutId);
            this._shiftClickTimeoutId = 0;
            this._shiftClickAppInfo = null;
        }
    }

    /**
     * @brief Single shift-click: minimize one window by cursor and advance cursor
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _minimizeOneByCursor(appInfo) {
        const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
        if (!app) {
            return;
        }

        const windows = this._getAppWindowsOnActiveWorkspace(app);
        const appId = appInfo.get_id();

        if (windows.length === 0) {
            this._shiftClickCursor.delete(appId);
            return;
        }

        let cursor = this._shiftClickCursor.get(appId) ?? 0;
        if (!Number.isFinite(cursor) || cursor < 0 || cursor >= windows.length) {
            cursor = 0;
        }

        const win = windows[cursor];
        try {
            if (!win.minimized) {
                win.minimize();
            }
        } catch (e) {
        }

        cursor = (cursor + 1) % windows.length;
        this._shiftClickCursor.set(appId, cursor);
    }

    /**
     * @brief Double shift-click: minimize all windows on the active workspace
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _minimizeAllOnActiveWorkspace(appInfo) {
        const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
        if (!app) {
            return;
        }
        const windows = this._getAppWindowsOnActiveWorkspace(app);
        for (const win of windows) {
            try {
                if (!win.minimized) {
                    win.minimize();
                }
            } catch (e) {
            }
        }
        this._shiftClickCursor.delete(appInfo.get_id());
    }

    /**
     * @brief Launch a new window of an app
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _launchNewApp(appInfo) {
        try {
            const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
            if (app) {
                try {
                    app.open_new_window(-1);
                    return;
                } catch (e) {
                }
            }
            try {
                const context = global.create_app_launch_context(0, -1);
                appInfo.launch([], context);
                return;
            } catch (e) {
            }
            try {
                appInfo.launch([], null);
                return;
            } catch (e) {
            }
            try {
                if (app) {
                    app.activate();
                }
            } catch (e) {
            }
        } catch (e) {
        }
    }

    /**
     * @brief Activate an app, cycling through its active-workspace windows
     * @param appInfo The Gio.DesktopAppInfo of the app
     */
    _launchApp(appInfo) {
        try {
            const app = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
            if (!app) {
                return;
            }

            if (app.get_state() !== Shell.AppState.RUNNING) {
                app.activate();
                return;
            }

            const windows = this._getAppWindowsOnActiveWorkspace(app);
            const appId = app.get_id();

            if (windows.length === 0) {
                this._shiftClickCursor.delete(appId);
                this._launchNewApp(appInfo);
                return;
            }

            if (windows.length === 1) {
                try {
                    windows[0].activate(global.get_current_time());
                } catch (e) {
                    app.activate();
                }
                this._shiftClickCursor.delete(appId);
                return;
            }

            let history = this._windowCycleHistory.get(appId) || [];
            const currentIds = new Set(windows.map(w => w.get_id()));
            history = history.filter(id => currentIds.has(id));

            let currentIndex = -1;
            if (history.length > 0) {
                const lastId = history[history.length - 1];
                currentIndex = windows.findIndex(w => w.get_id() === lastId);
            }
            if (currentIndex === -1) {
                const activeWindow = global.display.focus_window;
                if (activeWindow) {
                    currentIndex = windows.findIndex(w => w.get_id() === activeWindow.get_id());
                }
            }

            const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % windows.length;
            const nextWindow = windows[nextIndex];

            try {
                nextWindow.activate(global.get_current_time());
                history.push(nextWindow.get_id());
                if (history.length > windows.length * 2) {
                    history = history.slice(-windows.length);
                }
                this._windowCycleHistory.set(appId, history);
                this._shiftClickCursor.delete(appId);
            } catch (e) {
                app.activate();
            }
        } catch (e) {
        }
    }

    /**
     * @brief Destroy the dock actors and release all resources
     */
    _destroyDock() {
        this._cancelHide();
        this._cancelShiftClick();
        this._resetDragState();
        this._cancelRefreshDockItems();
        this._clearMenuWindowSignals();
        this._destroyLabel();

        if (this._updateIconGeometriesIdleId) {
            GLib.Source.remove(this._updateIconGeometriesIdleId);
            this._updateIconGeometriesIdleId = 0;
        }

        if (this._iconGeometryBatchId) {
            GLib.Source.remove(this._iconGeometryBatchId);
            this._iconGeometryBatchId = 0;
        }
        this._iconGeometryUpdates = null;

        if (this._menu) {
            try {
                this._menu.destroy();
            } catch (e) {
            }
            this._menu = null;
        }
        this._menuIsEmpty = false;
        this._menuTransitioning = false;

        if (this._layoutIdleId) {
            GLib.Source.remove(this._layoutIdleId);
            this._layoutIdleId = 0;
        }

        if (this._dockBox) {
            if (this._dockEnterId) {
                try {
                    this._dockBox.disconnect(this._dockEnterId);
                } catch (e) {
                }
                this._dockEnterId = null;
            }
            if (this._dockLeaveId) {
                try {
                    this._dockBox.disconnect(this._dockLeaveId);
                } catch (e) {
                }
                this._dockLeaveId = null;
            }
            if (this._alignXConstraint) {
                try {
                    this._dockBox.remove_constraint(this._alignXConstraint);
                } catch (e) {
                }
                try {
                    this._alignXConstraint.destroy?.();
                } catch (e) {
                }
                this._alignXConstraint = null;
            }
            for (const child of [...this._dockBox.get_children()]) {
                try {
                    child.destroy();
                } catch (e) {
                }
            }
            this._iconActors.clear();
            try {
                Main.layoutManager.removeChrome(this._dockBox);
            } catch (e) {
            }
            try {
                this._dockBox.destroy();
            } catch (e) {
            }
            this._dockBox = null;
        }
        this._dragSpace = null;
        this._visible = false;
        this._inOverview = false;
        this._shiftClickCursor.clear();
        this._windowCycleHistory.clear();
    }

    /**
     * @brief Safely read a boolean setting
     * @param key The settings key
     * @return The boolean value or false on error
     */
    _getB(key) {
        try {
            return this._settings.get_boolean(key);
        } catch (e) {
            return false;
        }
    }

    /**
     * @brief Safely read a string setting
     * @param key The settings key
     * @return The string value or empty string on error
     */
    _getS(key) {
        try {
            return this._settings.get_string(key);
        } catch (e) {
            return '';
        }
    }

    /**
     * @brief Safely read an integer setting
     * @param key The settings key
     * @return The integer value or 0 on error
     */
    _getI(key) {
        try {
            return this._settings.get_int(key);
        } catch (e) {
            return 0;
        }
    }

    /**
     * @brief Recompute all derived size values from the configured icon size
     */
    _updateSizes() {
        const size = this._readIconSize();
        this._iconSize = size;

        let buttonSize = Math.ceil(size * 1.2);
        if (buttonSize % 2 !== 0) {
            buttonSize += 1;
        }
        this._buttonSize = buttonSize;
        this._itemSize = this._buttonSize;

        let dockHeight = Math.ceil(size * 1.5);
        if (dockHeight % 2 !== 0) {
            dockHeight += 1;
        }
        this._dockHeight = dockHeight;
    }

    /**
     * @brief Read and validate the dock icon size setting, snapping to a legal step
     * @return Icon size in pixels, always one of DOCK_ICON_SIZE_STEPS
     */
    _readIconSize() {
        let v = DOCK_ICON_SIZE_DEFAULT;
        try {
            if (this._settings) {
                v = this._settings.get_int('dock-icon-size');
            }
        } catch (e) {
        }
        if (!Number.isFinite(v)) {
            return DOCK_ICON_SIZE_DEFAULT;
        }
        let best = DOCK_ICON_SIZE_STEPS[0];
        let bestDist = Infinity;
        for (const s of DOCK_ICON_SIZE_STEPS) {
            const d = Math.abs(s - v);
            if (d < bestDist) {
                bestDist = d;
                best = s;
            }
        }
        return best;
    }

    /**
     * @brief Apply the configured background color and opacity to the dock actor
     */
    _applyDockBackground() {
        if (!this._dockBox) {
            return;
        }
        let color = '#000000';
        try {
            color = this._settings.get_string('dock-background-color');
        } catch (e) {
        }
        let opacityPct = 50;
        try {
            opacityPct = this._settings.get_int('dock-background-opacity');
        } catch (e) {
        }
        opacityPct = Math.max(0, Math.min(100, opacityPct));

        const { r, g, b } = this._hexToRgb(color);
        const opacity = opacityPct / 100;
        try {
            this._dockBox.set_style(`background-color: rgba(${r}, ${g}, ${b}, ${opacity});`);
        } catch (e) {
        }
    }

    /**
     * @brief Convert a hex color string to an rgb object
     * @param hex Hex color string, e.g. #fff or #ffffff
     * @return Object with r, g, b byte values
     */
    _hexToRgb(hex) {
        let value = String(hex || '#000000').replace('#', '').trim();
        if (value.length === 3) {
            value = value.split('').map(c => c + c).join('');
        }
        if (!/^[0-9a-fA-F]{6}$/.test(value)) {
            value = '000000';
        }
        const int = parseInt(value, 16);
        return {
            r: (int >> 16) & 0xff,
            g: (int >> 8) & 0xff,
            b: int & 0xff,
        };
    }

    /**
     * @brief Disable the dock and release all resources
     */
    disable() {
        if (this._settingsShowEnableChangedId) {
            this._settings.disconnect(this._settingsShowEnableChangedId);
            this._settingsShowEnableChangedId = null;
        }
        if (this._settingsIconSizeChangedId) {
            this._settings.disconnect(this._settingsIconSizeChangedId);
            this._settingsIconSizeChangedId = null;
        }
        if (this._settingsBgColorChangedId) {
            this._settings.disconnect(this._settingsBgColorChangedId);
            this._settingsBgColorChangedId = null;
        }
        if (this._settingsBgOpacityChangedId) {
            this._settings.disconnect(this._settingsBgOpacityChangedId);
            this._settingsBgOpacityChangedId = null;
        }
        this._destroyDock();
        this._disconnectMonitor();
        this._disconnectMousePoll();
        this._shiftClickCursor.clear();
        this._windowCycleHistory.clear();
        if (this._menuManager) {
            this._menuManager = null;
        }
        this._settings = null;
    }
}

const DockDragActor = GObject.registerClass(
class DockDragActor extends St.Widget {

    /**
     * @brief Constructor, create the drag actor with the app icon
     * @param appInfo The app info to render
     * @param size The square size of the drag actor
     * @param iconSize The icon pixel size
     */
    _init(appInfo, size, iconSize) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            width: size, height: size,
            style: 'background-color: transparent; border: none;',
            reactive: false, opacity: 220,
        });
        let gicon = appInfo.get_icon();
        if (!gicon) {
            gicon = new Gio.ThemedIcon({ name: 'application-x-executable' });
        }
        const icon = new St.Icon({
            gicon: gicon, icon_size: iconSize || DOCK_ICON_SIZE_DEFAULT,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            x_expand: true, y_expand: true,
        });
        this.add_child(icon);
        this._appInfo = appInfo;
    }

    /**
     * @brief Return the app info of this drag actor
     * @return The Gio.DesktopAppInfo of the app
     */
    get appInfo() {
        return this._appInfo;
    }
});

const DockDragAgent = GObject.registerClass(
class DockDragAgent extends GObject.Object {

    /**
     * @brief Constructor, store the module, item box and app info
     * @param module The owning ModuleDock instance
     * @param itemBox The dock item actor used as the drag source
     * @param appInfo The app info of the item
     */
    _init(module, itemBox, appInfo) {
        super._init();
        this._module = module;
        this._itemBox = itemBox;
        this._appInfo = appInfo;
    }

    /**
     * @brief Create the drag actor shown while dragging
     * @return A new DockDragActor instance
     */
    getDragActor() {
        return new DockDragActor(this._appInfo, this._module._itemSize, this._module._iconSize);
    }

    /**
     * @brief Return the actor used as the drag source
     * @return The St.Widget used as the drag source
     */
    getDragActorSource() {
        return this._itemBox;
    }

    /**
     * @brief Forward the drag-over event to the module
     * @param source The drag source object
     * @param actor The drag actor
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @param time Event time
     * @return The drag motion result
     */
    handleDragOver(source, actor, x, y, time) {
        return this._module._handleDragOver(source, actor, x, y, time);
    }

    /**
     * @brief Forward the drop event to the module
     * @param source The drag source object
     * @param actor The drag actor
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @param time Event time
     * @return True if the drop was accepted
     */
    acceptDrop(source, actor, x, y, time) {
        return this._module._acceptDrop(source, actor, x, y, time);
    }
});

const DockDragSpace = GObject.registerClass(
class DockDragSpace extends GObject.Object {

    /**
     * @brief Constructor, store the owning module
     * @param module The owning ModuleDock instance
     */
    _init(module) {
        super._init();
        this._module = module;
    }

    /**
     * @brief Forward the drag-over event to the module
     * @param source The drag source object
     * @param actor The drag actor
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @param time Event time
     * @return The drag motion result
     */
    handleDragOver(source, actor, x, y, time) {
        return this._module._handleDragOver(source, actor, x, y, time);
    }

    /**
     * @brief Forward the drop event to the module
     * @param source The drag source object
     * @param actor The drag actor
     * @param x Pointer X in stage coordinates
     * @param y Pointer Y in stage coordinates
     * @param time Event time
     * @return True if the drop was accepted
     */
    acceptDrop(source, actor, x, y, time) {
        return this._module._acceptDrop(source, actor, x, y, time);
    }
});
