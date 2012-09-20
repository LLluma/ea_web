/*---------------------------------------------------------
 * OpenERP web_calendar
 *---------------------------------------------------------*/

openerp.web_calendar = function(openerp) {
var _t = openerp.web._t,
   _lt = openerp.web._lt;
var QWeb = openerp.web.qweb;
openerp.web.views.add('calendar', 'openerp.web_calendar.CalendarView');
openerp.web_calendar.CalendarView = openerp.web.View.extend({
    display_name: _lt('Calendar'),
// Dhtmlx scheduler ?
    init: function(parent, dataset, view_id, options) {
        this._super(parent);
        this.ready = $.Deferred();
        this.set_default_options(options);
        this.dataset = dataset;
        this.model = dataset.model;
        this.fields_view = {};
        this.view_id = view_id;
        this.has_been_loaded = $.Deferred();
        this.creating_event_id = null;
        this.dataset_events = [];
        this.form_dialog = new openerp.web_calendar.CalendarFormDialog(this, {
                destroy_on_close: false,
                width: '80%',
                min_width: 850
            }, this.options.action_views_ids.form, dataset);
        this.form_dialog.start();
        this.COLOR_PALETTE = ['#f57900', '#cc0000', '#d400a8', '#75507b', '#3465a4', '#73d216', '#c17d11', '#edd400',
             '#fcaf3e', '#ef2929', '#ff00c9', '#ad7fa8', '#729fcf', '#8ae234', '#e9b96e', '#fce94f',
             '#ff8e00', '#ff0000', '#b0008c', '#9000ff', '#0078ff', '#00ff00', '#e6ff00', '#ffff00',
             '#905000', '#9b0000', '#840067', '#510090', '#0000c9', '#009b00', '#9abe00', '#ffc900' ];
        this.color_map = {};
        this.last_search = [];
        this.range_start = null;
        this.range_stop = null;
        this.update_range_dates(Date.today());
        this.selected_filters = [];
    },
    start: function() {
        this._super();
        return this.rpc("/web/view/load", {"model": this.model, "view_id": this.view_id, "view_type":"calendar", 'toolbar': true}, this.on_loaded);
    },
    stop: function() {
        scheduler.clearAll();
        this._super();
    },
    on_loaded: function(data) {
        this.fields_view = data;
        this.calendar_fields = {};
        this.ids = this.dataset.ids;
        this.color_values = [];
        this.info_fields = [];

        this.name = this.fields_view.name || this.fields_view.arch.attrs.string;
        this.view_id = this.fields_view.view_id;

        // mode, one of month, week or day
        this.mode = this.fields_view.arch.attrs.mode;

        // date_start is mandatory, date_delay and date_stop are optional
        this.date_start = this.fields_view.arch.attrs.date_start;
        this.date_delay = this.fields_view.arch.attrs.date_delay;
        this.date_stop = this.fields_view.arch.attrs.date_stop;

        this.day_length = this.fields_view.arch.attrs.day_length || 8;
        this.color_field = this.fields_view.arch.attrs.color;
        this.color_string = this.fields_view.fields[this.color_field] ?
            this.fields_view.fields[this.color_field].string : _t("Filter");

        if (this.color_field && this.selected_filters.length === 0) {
            var default_filter;
            if (default_filter = this.dataset.context['calendar_default_' + this.color_field]) {
                this.selected_filters.push(default_filter + '');
            }
        }
        this.fields =  this.fields_view.fields;

        if (!this.date_start) {
            throw new Error("Calendar view has not defined 'date_start' attribute.");
        }

        //* Calendar Fields *
        this.calendar_fields.date_start = {'name': this.date_start, 'kind': this.fields[this.date_start].type};

        if (this.date_delay) {
            if (this.fields[this.date_delay].type != 'float') {
                throw new Error("Calendar view has a 'date_delay' type != float");
            }
            this.calendar_fields.date_delay = {'name': this.date_delay, 'kind': this.fields[this.date_delay].type};
        }
        if (this.date_stop) {
            this.calendar_fields.date_stop = {'name': this.date_stop, 'kind': this.fields[this.date_stop].type};
        }

        for (var fld = 0; fld < this.fields_view.arch.children.length; fld++) {
            this.info_fields.push(this.fields_view.arch.children[fld].attrs.name);
        }
        this.$element.html(QWeb.render("CalendarView", {"fields_view": this.fields_view}));

        if (this.options.sidebar && this.options.sidebar_id) {
            this.sidebar = new openerp.web.Sidebar(this, this.options.sidebar_id);
            this.sidebar.start();
            this.sidebar.navigator = new openerp.web_calendar.SidebarNavigator(this.sidebar, this);
            this.sidebar.responsible = new openerp.web_calendar.SidebarResponsible(this.sidebar, this);
            this.sidebar.add_toolbar(this.fields_view.toolbar);
            this.set_common_sidebar_sections(this.sidebar);
            this.sidebar.do_unfold();
            this.sidebar.do_fold.add_last(this.refresh_scheduler);
            this.sidebar.do_unfold.add_last(this.refresh_scheduler);
            this.sidebar.do_toggle.add_last(this.refresh_scheduler);
        }

        this.init_scheduler();
        this.has_been_loaded.resolve();
    },
    init_scheduler: function() {
        var self = this;
        scheduler.clearAll();
        if (this.fields[this.date_start]['type'] == 'time') {
            scheduler.config.xml_date = "%H:%M:%S";
        } else {
            scheduler.config.xml_date = "%Y-%m-%d %H:%i";
        }
        scheduler.config.api_date = "%Y-%m-%d %H:%i";
        scheduler.config.multi_day = true; //Multi day events are not rendered in daily and weekly views
        scheduler.config.start_on_monday = Date.CultureInfo.firstDayOfWeek !== 0; //Sunday = Sunday, Others = Monday
        scheduler.config.time_step = 30;
        scheduler.config.scroll_hour = 8;
        scheduler.config.drag_resize = true;
        scheduler.config.drag_create = true;
        scheduler.config.mark_now = true;
        scheduler.config.day_date = '%l %j';

        scheduler.locale = {
            date:{
                month_full: Date.CultureInfo.monthNames,
                month_short: Date.CultureInfo.abbreviatedMonthNames,
                day_full: Date.CultureInfo.dayNames,
                day_short: Date.CultureInfo.abbreviatedDayNames
            },
            labels:{
                dhx_cal_today_button: _t("Today"),
                day_tab: _t("Day"),
                week_tab: _t("Week"),
                month_tab: _t("Month"),
                new_event: _t("New event"),
                icon_save: _t("Save"),
                icon_cancel: _t("Cancel"),
                icon_details: _t("Details"),
                icon_edit: _t("Edit"),
                icon_delete: _t("Delete"),
                confirm_closing: "",//Your changes will be lost, are your sure ?
                confirm_deleting: _t("Event will be deleted permanently, are you sure?"),
                section_description: _t("Description"),
                section_time: _t("Time period"),
                full_day: _t("Full day"),

                /*recurring events*/
                confirm_recurring: _t("Do you want to edit the whole set of repeated events?"),
                section_recurring: _t("Repeat event"),
                button_recurring: _t("Disabled"),
                button_recurring_open: _t("Enabled"),

                /*agenda view extension*/
                agenda_tab: _t("Agenda"),
                date: _t("Date"),
                description: _t("Description"),

                /*year view extension*/
                year_tab: _t("Year"),

                /* week agenda extension */
                week_agenda_tab: _t("Agenda")
            }
        };
        scheduler.init('openerp_scheduler', null, this.mode || 'month');

        // Remove hard coded style attributes from dhtmlx scheduler
        this.$element.find(".dhx_cal_navline div").removeAttr('style');

        scheduler.detachAllEvents();
        scheduler.attachEvent('onEventAdded', this.do_create_event);
        scheduler.attachEvent('onEventDeleted', this.do_delete_event);
        scheduler.attachEvent('onEventChanged', this.do_save_event);
        scheduler.attachEvent('onClick', this.do_edit_event);
        scheduler.attachEvent('onLightbox', this.do_edit_event);

        scheduler.attachEvent('onViewChange', this.on_view_changed);
        this.refresh_scheduler();

        if (this.options.sidebar) {
            this.mini_calendar = scheduler.renderCalendar({
                container: this.sidebar.navigator.element_id,
                navigation: true,
                date: scheduler._date,
                handler: function(date, calendar) {
                    scheduler.setCurrentView(date, 'day');
                }
            });
        }
    },
    on_view_changed: function(mode, date) {
        this.$element.removeClass('oe_cal_day oe_cal_week oe_cal_month').addClass('oe_cal_' + mode);
        if (!date.between(this.range_start, this.range_stop)) {
            this.update_range_dates(date);
            this.do_ranged_search();
        }
        this.ready.resolve();
    },
    update_range_dates: function(date) {
        this.range_start = date.clone().moveToFirstDayOfMonth();
        this.range_stop = this.range_start.clone().addMonths(1).addSeconds(-1);
    },
    refresh_scheduler: function() {
        scheduler.setCurrentView(scheduler._date);
    },
    refresh_minical: function() {
        if (this.options.sidebar) {
            scheduler.updateCalendar(this.mini_calendar);
        }
    },
    reload_event: function(id) {
        this.dataset.read_ids([id], _.keys(this.fields)).then(this.on_events_loaded);
    },
    get_color: function(key) {
        if (this.color_map[key]) {
            return this.color_map[key];
        }
        var index = _.keys(this.color_map).length % this.COLOR_PALETTE.length;
        var color = this.COLOR_PALETTE[index];
        this.color_map[key] = color;
        return color;
    },
    on_events_loaded: function(events, fn_filter, no_filter_reload) {
        var self = this;

        //To parse Events we have to convert date Format
        var res_events = [],
            sidebar_items = {};
        for (var e = 0; e < events.length; e++) {
            var evt = events[e];
            if (!evt[this.date_start]) {
                break;
            }

            if (this.color_field) {
                var filter = evt[this.color_field];
                if (filter) {
                    var filter_value = (typeof filter === 'object') ? filter[0] : filter;
                    if (typeof(fn_filter) === 'function' && !fn_filter(filter_value)) {
                        continue;
                    }
                    var filter_item = {
                        value: filter_value,
                        label: (typeof filter === 'object') ? filter[1] : filter,
                        color: this.get_color(filter_value)
                    };
                    if (!sidebar_items[filter_value]) {
                        sidebar_items[filter_value] = filter_item;
                    }
                    evt.color = filter_item.color;
                    evt.textColor = '#ffffff';
                }
            }

            if (this.fields[this.date_start]['type'] == 'date') {
                evt[this.date_start] = openerp.web.auto_str_to_date(evt[this.date_start]).set({hour: 9}).toString('yyyy-MM-dd HH:mm:ss');
            }
            if (this.date_stop && evt[this.date_stop] && this.fields[this.date_stop]['type'] == 'date') {
                evt[this.date_stop] = openerp.web.auto_str_to_date(evt[this.date_stop]).set({hour: 17}).toString('yyyy-MM-dd HH:mm:ss');
            }
            res_events.push(this.convert_event(evt));
        }
        scheduler.parse(res_events, 'json');
        this.refresh_scheduler();
        this.refresh_minical();
        if (!no_filter_reload && this.options.sidebar) {
            this.sidebar.responsible.on_events_loaded(sidebar_items);
        }
    },
    convert_event: function(evt) {
        var self = this;
        var date_start = openerp.web.str_to_datetime(evt[this.date_start]),
            date_stop = this.date_stop ? openerp.web.str_to_datetime(evt[this.date_stop]) : null,
            date_delay = evt[this.date_delay] || 1.0,
            res_text = '';

        if (this.info_fields) {
            res_text = _(this.info_fields).chain()
                .filter(function(fld) { return self.fields[fld].type == 'boolean' ? fld : !_.isBoolean(evt[fld]) && fld; })
                .map(function(fld) { return (evt[fld] instanceof Array) ? evt[fld][1] : evt[fld]; }).value();
        }
        if (!date_stop && date_delay) {
            date_stop = date_start.clone().addHours(date_delay);
        }
        var r = {
            'start_date': date_start.toString('yyyy-MM-dd HH:mm:ss'),
            'end_date': date_stop.toString('yyyy-MM-dd HH:mm:ss'),
            'text': res_text.join(', '),
            'id': evt.id
        };
        if (evt.color) {
            r.color = evt.color;
        }
        if (evt.textColor) {
            r.textColor = evt.textColor;
        }
        return r;
    },
    do_create_event: function(event_id, event_obj) {
        var self = this,
            data = this.get_event_data(event_obj);
        this.dataset.create(data, function(r) {
            var id = r.result;
            self.dataset.ids.push(id);
            scheduler.changeEventId(event_id, id);
            self.refresh_minical();
            self.reload_event(id);
        }, function(r, event) {
            event.preventDefault();
            self.do_create_event_with_formdialog(event_id, event_obj);
        });
    },
    do_create_event_with_formdialog: function(event_id, event_obj) {
        if (!event_obj) {
            event_obj = scheduler.getEvent(event_id);
        }
        var self = this,
            data = this.get_event_data(event_obj),
            form = self.form_dialog.form,
            fields_to_fetch = _(form.fields_view.fields).keys();
        this.dataset.index = null;
        self.creating_event_id = event_id;
        this.form_dialog.form.do_show().then(function() {
            _.each(['date_start', 'date_delay', 'date_stop'], function(field) {
                var field_name = self[field];
                if (field_name && form.fields[field_name]) {
                    var ffield = form.fields[field_name];
                    ffield.reset();
                    $.when(ffield.set_value(data[field_name])).then(function() {
                        ffield.validate();
                        ffield.dirty = true;
                        form.do_onchange(ffield);
                    });
                }
            });
            self.form_dialog.open();
        });
    },
    do_save_event: function(event_id, event_obj) {
        var self = this,
            data = this.get_event_data(event_obj),
            index = this.dataset.get_id_index(event_id);
        if (index != null) {
            event_id = this.dataset.ids[index];
            this.dataset.write(event_id, data, {})
                .then(function() {
                    self.refresh_minical();
                }, function() {
                    self.reload_event(event_id);
                });
        }
    },
    do_delete_event: function(event_id, event_obj) {
        // dhtmlx sends this event even when it does not exist in openerp.
        // Eg: use cancel in dhtmlx new event dialog
        var self = this,
            index = this.dataset.get_id_index(event_id);
        if (index !== null) {
            this.dataset.unlink(event_id, function() {
                self.refresh_minical();
            });
        }
    },
    do_edit_event: function(event_id, evt) {
        var self = this;
        var index = this.dataset.get_id_index(event_id);
        if (index !== null) {
            this.dataset.index = index;
            this.do_switch_view('page');
        } else if (scheduler.getState().mode === 'month') {
            var event_obj = scheduler.getEvent(event_id);
            if (event_obj._length === 1) {
                event_obj['start_date'].addHours(8);
                event_obj['end_date'] = new Date(event_obj['start_date']);
                event_obj['end_date'].addHours(1);
            } else {
                event_obj['start_date'].addHours(8);
                event_obj['end_date'].addHours(-4);
            }
            this.do_create_event_with_formdialog(event_id, event_obj);
            // return false;
            // Theorically, returning false should prevent the lightbox to open.
            // It works, but then the scheduler is in a buggy state where drag'n drop
            // related internal Event won't be fired anymore.
            // I tried scheduler.editStop(event_id); but doesn't work either
            // After losing one hour on this, here's a quick and very dirty fix :
            $(".dhx_cancel_btn").click();
        } else {
            scheduler.editStop($(evt.target).hasClass('icon_save'));
        }
    },
    get_event_data: function(event_obj) {
        var data = {
            name: event_obj.text
        };
        data[this.date_start] = openerp.web.datetime_to_str(event_obj.start_date);
        if (this.date_stop) {
            data[this.date_stop] = openerp.web.datetime_to_str(event_obj.end_date);
        }
        if (this.date_delay) {
            var diff_seconds = Math.round((event_obj.end_date.getTime() - event_obj.start_date.getTime()) / 1000);
            data[this.date_delay] = diff_seconds / 3600;
        }
        return data;
    },
    do_search: function(domain, context, group_by) {
        this.last_search = arguments;
        this.do_ranged_search();
    },
    do_ranged_search: function() {
        var self = this;
        scheduler.clearAll();
        $.when(this.has_been_loaded, this.ready).then(function() {
            self.dataset.read_slice(_.keys(self.fields), {
                offset: 0,
                domain: self.get_range_domain(),
                context: self.last_search[1]
            }).then(function(events) {
                self.dataset_events = events;
                self.on_events_loaded(events);
            });
        });
    },
    get_range_domain: function() {
        var format = openerp.web.date_to_str,
            domain = this.last_search[0].slice(0);
        domain.unshift([this.date_start, '>=', format(this.range_start.clone().addDays(-6))]);
        domain.unshift([this.date_start, '<=', format(this.range_stop.clone().addDays(6))]);
        return domain;
    },
    do_show: function () {
        var self = this;
        $.when(this.has_been_loaded).then(function() {
            self.$element.show();
            if (self.sidebar) {
                self.sidebar.$element.show();
            }
            self.do_push_state({});
        });
    },
    do_hide: function () {
        this._super();
        if (this.sidebar) {
            this.sidebar.$element.hide();
        }
    },
    get_selected_ids: function() {
        // no way to select a record anyway
        return [];
    }
});

openerp.web_calendar.CalendarFormDialog = openerp.web.Dialog.extend({
    init: function(view, options, view_id, dataset) {
        this._super(view, options);
        this.dataset = dataset;
        this.view_id = view_id;
        this.view = view;
    },
    start: function() {
        var self = this;
        this._super();
        this.form = new openerp.web.FormView(this, this.dataset, this.view_id, {
            sidebar: false,
            pager: false
        });
        this.form.appendTo(this.$element);
        this.form.on_created.add_last(this.on_form_dialog_saved);
        this.form.on_saved.add_last(this.on_form_dialog_saved);
        this.form.on_button_cancel = function() {
            self.close();
        }
    },
    on_form_dialog_saved: function() {
        var id = this.dataset.ids[this.dataset.index];
        if (this.view.creating_event_id) {
            scheduler.changeEventId(this.view.creating_event_id, id);
            this.view.creating_event_id = null;
        }
        this.view.reload_event(id);
        this.close();
    },
    on_close: function() {
        if (this.view.creating_event_id) {
            scheduler.deleteEvent(this.view.creating_event_id);
            this.view.creating_event_id = null;
        }
    }
});

openerp.web_calendar.SidebarResponsible = openerp.web.OldWidget.extend({
    // TODO: fme: in trunk, rename this class to SidebarFilter
    init: function(parent, view) {
        var $section = parent.add_section(view.color_string, 'responsible');
        this.$div = $('<div></div>');
        $section.append(this.$div);
        this._super(parent, $section.attr('id'));
        this.view = view;
        this.$element.delegate('input:checkbox', 'change', this.on_filter_click);
    },
    on_events_loaded: function(filters) {
        var selected_filters = this.view.selected_filters.slice(0);
        this.$div.html(QWeb.render('CalendarView.sidebar.responsible', { filters: filters }));
        this.$element.find('div.oe_calendar_responsible input').each(function() {
            if (_.indexOf(selected_filters, $(this).val()) > -1) {
                $(this).click();
            }
        });
    },
    on_filter_click: function(e) {
        var self = this,
            responsibles = [],
            $e = $(e.target);
        this.view.selected_filters = [];
        this.$element.find('div.oe_calendar_responsible input:checked').each(function() {
            responsibles.push($(this).val());
            self.view.selected_filters.push($(this).val());
        });
        scheduler.clearAll();
        if (responsibles.length) {
            this.view.on_events_loaded(this.view.dataset_events, function(filter_value) {
                return _.indexOf(responsibles, filter_value.toString()) > -1;
            }, true);
        } else {
            this.view.on_events_loaded(this.view.dataset_events, false, true);
        }
    }
});

openerp.web_calendar.SidebarNavigator = openerp.web.OldWidget.extend({
    init: function(parent, view) {
        var $section = parent.add_section(_t('Navigator'), 'navigator');
        this._super(parent, $section.attr('id'));
        this.view = view;
    },
    on_events_loaded: function(events) {
    }
});
};

// DEBUG_RPC:rpc.request:('execute', 'addons-dsh-l10n_us', 1, '*', ('ir.filters', 'get_filters', u'res.partner'))
// vim:et fdc=0 fdl=0 foldnestmax=3 fdm=syntax:
