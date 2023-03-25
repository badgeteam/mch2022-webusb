'use strict';

class Renderer {
    constructor() {
        this.page_rendered = false;
        this.templates = {};
        this.compile_templates();
    }
    
    compile_templates() {
        Handlebars.registerHelper({
            eq:     function (v1, v2)      { return v1 === v2; },
            ne:     function (v1, v2)      { return v1 !== v2; },
            lt:     function (v1, v2)      { return v1 < v2;   },
            gt:     function (v1, v2)      { return v1 > v2;   },
            lte:    function (v1, v2)      { return v1 <= v2;  },
            gte:    function (v1, v2)      { return v1 >= v2;  },
            and:    function ()            { return Array.prototype.slice.call(arguments).every(Boolean); },
            or:     function ()            { return Array.prototype.slice.call(arguments, 0, -1).some(Boolean); },
            list:   function (v1)          { return Array.isArray(v1); },
            length: function (v1)          { return v1.length; },
            string: function (v1)          { return (typeof v1 === "string"); },
            isset:  function (v1)          { return (typeof v1 !== "undefined"); },
            isin:   function (list, value) { return list.includes(value); },
            isinobjinlist: function (list, value, key) {
                for (var i in list) {
                    var item = list[i];
                    if (item[key] === value) return true;
                }
                return false;
            },
            replace_newlines: (text) => {
                if (typeof text === "string") {
                    text = Handlebars.Utils.escapeExpression(text);
                    return new Handlebars.SafeString(text.split("\n").join("<br />"));
                }
                return text;
            },
            current_id: () => {
                if (typeof window.handlebars_incremental_identifier !== "number") {
                    window.handlebars_incremental_identifier = 0;
                }
                return window.handlebars_incremental_identifier;
            },
            next_id: () => {
                if (typeof window.handlebars_incremental_identifier !== "number") {
                    window.handlebars_incremental_identifier = 0;
                }
                return window.handlebars_incremental_identifier++;
            },
            uppercase: (text) => {
                return text.toUpperCase();
            },
            lowercase: (text) => {
                return text.toLowerCase();
            },
            setvar: (name, value, options) => {
                options.data.root[name] = value;
            }
        });

        Handlebars.registerPartial("navbar", document.getElementById("tpl-navbar").innerHTML);
        Handlebars.registerPartial("navbar_nav_item", document.getElementById("tpl-navbar-nav-item").innerHTML);
        Handlebars.registerPartial("navbar_dropdown", document.getElementById("tpl-navbar-dropdown").innerHTML);
        Handlebars.registerPartial("sidebar", document.getElementById("tpl-sidebar").innerHTML);
        Handlebars.registerPartial("sidebar_nav", document.getElementById("tpl-sidebar-nav").innerHTML);
        Handlebars.registerPartial("sidebar_nav_item", document.getElementById("tpl-sidebar-nav-item").innerHTML);
        Handlebars.registerPartial("content", document.getElementById("tpl-content").innerHTML);
        Handlebars.registerPartial("footer", document.getElementById("tpl-footer").innerHTML);
        Handlebars.registerPartial("title", document.getElementById("tpl-title").innerHTML);
        Handlebars.registerPartial("content_row", document.getElementById("tpl-content-row").innerHTML);
        Handlebars.registerPartial("content_column", document.getElementById("tpl-content-column").innerHTML);
        Handlebars.registerPartial("content_element", document.getElementById("tpl-content-element").innerHTML);
        Handlebars.registerPartial("content_element_inner", document.getElementById("tpl-content-element-inner").innerHTML);
        Handlebars.registerPartial("icon", document.getElementById("tpl-icon").innerHTML);
        Handlebars.registerPartial("link", document.getElementById("tpl-link").innerHTML);
        Handlebars.registerPartial("button", document.getElementById("tpl-button").innerHTML);
        Handlebars.registerPartial("card", document.getElementById("tpl-card").innerHTML);
        Handlebars.registerPartial("card_inner", document.getElementById("tpl-card-inner").innerHTML);
        Handlebars.registerPartial("table", document.getElementById("tpl-table").innerHTML);
        Handlebars.registerPartial("flexbox", document.getElementById("tpl-flexbox").innerHTML);
        Handlebars.registerPartial("small_box", document.getElementById("tpl-small-box").innerHTML);
        Handlebars.registerPartial("small_box_inner", document.getElementById("tpl-small-box-inner").innerHTML);
        Handlebars.registerPartial("callout", document.getElementById("tpl-callout").innerHTML);
        Handlebars.registerPartial("modal_inner", document.getElementById("tpl-modal-inner").innerHTML);
        Handlebars.registerPartial("form_group", document.getElementById("tpl-form-group").innerHTML);
        Handlebars.registerPartial("input_group", document.getElementById("tpl-input-group").innerHTML);
        Handlebars.registerPartial("input", document.getElementById("tpl-input").innerHTML);
        Handlebars.registerPartial("input_prepend", document.getElementById("tpl-input-prepend").innerHTML);
        Handlebars.registerPartial("input_append", document.getElementById("tpl-input-append").innerHTML);

        // Rendering a full page
        this.templates["text"] = Handlebars.compile(document.getElementById("tpl-text").innerHTML);

        // Replacing frame content
        this.templates["navbar"] = Handlebars.compile(document.getElementById("tpl-navbar").innerHTML);
        this.templates["sidebar"] = Handlebars.compile(document.getElementById("tpl-sidebar").innerHTML);
        this.templates["content"] = Handlebars.compile(document.getElementById("tpl-content").innerHTML);
        this.templates["footer"] = Handlebars.compile(document.getElementById("tpl-footer").innerHTML);

        // Replacing element content
        this.templates["card"] = Handlebars.compile(document.getElementById("tpl-card-inner").innerHTML);
        this.templates["small_box"] = Handlebars.compile(document.getElementById("tpl-small-box-inner").innerHTML);
        
        // Rendering standalone elements
        this.templates["modal"] = Handlebars.compile(document.getElementById("tpl-modal").innerHTML);
        this.templates["modal_inner"] = Handlebars.compile(document.getElementById("tpl-modal-inner").innerHTML);
    }

    render(content) {
        document.getElementById('navbar').innerHTML = this.templates["navbar"](content.navbar);
        document.getElementById('sidebar').innerHTML = this.templates["sidebar"](content.sidebar);
        document.getElementById('content').innerHTML = this.templates["content"](content.content);
        document.getElementById('footer').innerHTML = this.templates["footer"](content.footer);
        if (!this.page_rendered) {
            document.getElementById("initial").classList.add("fadeout");
            document.getElementById("wrapper").classList.add("fadein");
            setTimeout(() => {
                document.getElementById("initial").style.display = "none";
                document.getElementById("page").style.display = "";
            }, 450);
        }
        this.page_rendered = true;
    }
    
    get_page_rendered() {
        return this.page_rendered;
    }
    
    render_navbar(content) {
        if (!this.page_rendered) return false;
        document.getElementById('navbar').innerHTML = this.templates["navbar"](content);
        return true;
    }
    
    render_sidebar(content) {
        if (!this.page_rendered) return false;
        document.getElementById('sidebar').innerHTML = this.templates["sidebar"](content);
        return true;
    }
    
    render_content(content) {
        if (!this.page_rendered) return false;
        document.getElementById('content').innerHTML = this.templates["content"](content);
        return true;
    }
    
    render_footer(content) {
        if (!this.page_rendered) return false;
        document.getElementById('footer').innerHTML = this.templates["footer"](content);
        return true;
    }
    
    modal_add(content = {}) {
        if (typeof content !== "object") {
            throw Error("Expected content to be an object");
        }
        if (typeof content.id !== "string") {
            throw Error("Expected content.id to be a string");
        }
        if (!this.modal_update(content.id, content)) {
            document.getElementById('modals').innerHTML += this.templates["modal"](content);
        }
    }
    
    modal_remove(identifier) {
        this.modal_hide(identifier);
        setTimeout(() => {
            document.getElementById(identifier).outerHTML = "";
        }, 200);
    }
    
    modal_update(identifier, content) {
        let element = document.getElementById(identifier);
        if (element !== null) {
            element.innerHTML = this.templates["modal_inner"](content);
            return true;
        }
        return false;
    }
    
    modal_show(identifier, allow_close = false) {
        let element = $("#" + String(identifier));
        if (allow_close) {
            element.modal("show");
        } else {
            element.modal({backdrop: 'static', keyboard: false}, "show");
        }
    }

    modal_hide(identifier) {
        $("#" + String(identifier)).modal("hide");
    }
    
    render_loading(text = "Loading...", color = "warning") {
        if (!this.page_rendered) {
            document.getElementById("loading-message-initial").innerHTML = this.templates["text"](text);
        } else {
            const identifier = "loading-message";
            if (text === null) {
                this.modal_hide(identifier);
            } else {
                let content = {
                    id: identifier,
                    fade: true,
                    element: {
                        type: "callout",
                        content: {
                            color: color,
                            icon: "spinner",
                            content: [
                                {
                                    type: "icon",
                                    content: {
                                        icon: "circle-notch",
                                        spin: true
                                    }
                                },
                                {
                                    type: "separator"
                                },
                                {
                                    type: "span",
                                    content: text
                                }
                            ]
                        }
                    }
                };
                this.modal_add(content);
                this.modal_show(content.id);
            }
        }
    }
}
