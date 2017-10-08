window.addEventListener('load', init, false);

function init() {
	if (localStorage.popupHeight) document.body.style.height = localStorage.popupHeight + 'px';
	if (localStorage.popupWidth) document.body.style.width = localStorage.popupWidth + 'px';
};

(function(window){
	var document = window.document;
	var chrome = window.chrome;
	var localStorage = window.localStorage;
	var navigator = window.navigator;
	var body = document.body;
	var _m = chrome.i18n.getMessage;
	var _b = chrome.extension.getBackgroundPage().console;
	
	// Error alert
	var AlertDialog = {
		open: function(dialog){
			if (!dialog) return;
			$('alert-dialog-text').innerHTML = dialog;
			body.addClass('needAlert');
		},
		close: function(){
			body.removeClass('needAlert');
		}
	};
	// popdown toast when an error occurs
	window.addEventListener('error', function(){
		AlertDialog.open('<strong>' + _m('errorOccured') + '</strong><br>' + _m('reportedToDeveloper'));
	}, false);
	
	// Platform detection
	var os = (navigator.platform.toLowerCase().match(/mac|win|linux/i) || ['other'])[0];
	body.addClass(os);
	
	// Chrome version detection
	var version = (function(){
		var v = {};
		var keys = ['major', 'minor', 'build', 'patch'];
		var matches = navigator.userAgent.match(/chrome\/([\d]+)\.([\d]+)\.([\d]+)\.([\d]+)/i);
		if (!matches) return null;
		matches.slice(1).forEach(function(m, i){
			v[keys[i]] = m.toInt();
		});
		return v;
	})();
	
	// Some i18n
	$('search-input').placeholder = _m('searchBookmarks');
	$('edit-dialog-name').placeholder = _m('name');
	$('edit-dialog-url').placeholder = _m('url');
	$each({
		'bookmark-new-tab': 'openNewTab',
		'bookmark-new-window': 'openNewWindow',
		'bookmark-new-incognito-window': 'openIncognitoWindow',
		'bookmark-edit': 'edit',
		'bookmark-delete': 'delete',
		'folder-window': 'openBookmarks',
		'folder-new-window': 'openBookmarksNewWindow',
		'folder-new-incognito-window': 'openBookmarksIncognitoWindow',
		'folder-edit': 'edit',
		'folder-delete': 'deleteEllipsis',
		'edit-dialog-button': 'save'
	}, function(msg, id){
		var el = $(id), m = _m(msg);
		if (el.tagName == 'COMMAND') el.label = m;
		el.textContent = m;
	});
	
	// RTL indicator
	var rtl = (body.getComputedStyle('direction') == 'rtl');
	if (rtl) body.addClass('rtl');
	
	// Init some variables
	var opens = localStorage.opens ? JSON.parse(localStorage.opens) : [];
	var rememberState = !localStorage.dontRememberState;
	var a = document.createElement('a');
	var httpsPattern = /^https?:\/\//i;
	
	// Adaptive bookmark tooltips
	var adaptBookmarkTooltips = function(){
		var bookmarks = document.querySelectorAll('li.child a');
		for (var i = 0, l = bookmarks.length; i < l; i++){
			var bookmark = bookmarks[i];
			if (bookmark.hasClass('titled')){
				if (bookmark.scrollWidth <= bookmark.offsetWidth){
					bookmark.title = bookmark.href;
					bookmark.removeClass('titled');
				}
			} else if (bookmark.scrollWidth > bookmark.offsetWidth){
				var text = bookmark.querySelector('i').textContent;
				var title = bookmark.title;
				if (text != title){
					bookmark.title = text + '\n' + title;
					bookmark.addClass('titled');
				}
			}
		}
	};
	
	var generateBookmarkHTML = function(title, url, extras){
		if (!extras) extras = '';
		var u = url.htmlspecialchars();
		var favicon = 'chrome://favicon/' + u;
		var tooltipURL = url;
		if (/^javascript:/i.test(url)){
			if (url.length > 140) tooltipURL = url.slice(0, 140) + '...';
			favicon = 'document-code.png';
		}
		tooltipURL = tooltipURL.htmlspecialchars();
		var name = title.htmlspecialchars() || (httpsPattern.test(url) ? url.replace(httpsPattern, '') : _m('noTitle'));
		return '<a href="' + u + '"' + ' title="' + tooltipURL + '" tabindex="0" ' + extras + '>'
			+ '<img src="' + favicon + '" width="16" height="16" alt=""><i>' + name + '</i>' + '</a>';
	};
	
	var generateHTML = function(data, level){
		if (!level) level = 0;
		var paddingStart = 14 * level;
		var group = (level == 0) ? 'tree' : 'group';
		var html = '<ul role="' + group + '" data-level="' + level + '">';
		var folder_content = '';
		var other_content = '';
		
		for (var i = 0, l = data.length; i < l; i++){
			var d = data[i];
			var children = d.children;
			var title = d.title.htmlspecialchars();
			var url = d.url;
			var id = d.id;
			var parentID = d.parentId;
			var idHTML = id ? ' id="neat-tree-item-' + id + '"': '';
			var isFolder = d.dateGroupModified || children || typeof url == 'undefined';
			if (isFolder){
				var isOpen = false;
				var open = '';
				if (rememberState){
					isOpen = opens.contains(id);
					if (isOpen) open = ' open';
				}
				folder_content += '<li class="parent' + open + '"' + idHTML + ' role="treeitem" aria-expanded="' + isOpen + '" data-parentid="' + parentID + '">'
					+ '<span tabindex="0" style="-webkit-padding-start: ' + paddingStart + 'px"><b class="twisty"></b>'
					+ '<img src="folder.png" width="16" height="16" alt=""><i>' + (title || _m('noTitle')) + '</i>' + '</span>';
				if (isOpen){
					if (children){
						folder_content  += generateHTML(children, level + 1);
					} else {
						(function(_id){
							chrome.bookmarks.getChildren(_id, function(children){
								var html = generateHTML(children, level + 1);
								var div = document.createElement('div');
								div.innerHTML = html;
								var ul = div.querySelector('ul');
								ul.inject($('neat-tree-item-' + _id));
								div.destroy();
							});
						})(id);
					}
				}
				folder_content += '</li>';
			} else {
				other_content += '<li class="child"' + idHTML + ' role="treeitem" data-parentid="' + parentID + '">'
					+ generateBookmarkHTML(title, url, 'style="-webkit-padding-start: ' + paddingStart + 'px"')+'</li>';;
			}
			
		}
		html += folder_content +other_content+'</ul>';
		return html;
	};
	
	var $tree = $('tree');
	chrome.bookmarks.getTree(function(tree){
		var html = generateHTML(tree[0].children);
		$tree.innerHTML = html;
		
		// recall scroll position (from top of popup) when tree opened
		if (rememberState) $tree.scrollTop = localStorage.scrollTop || 0;
		
		var focusID = localStorage.focusID;
		if (typeof focusID != 'undefined' && focusID != null){
			var focusEl = $('neat-tree-item-' + focusID);
			if (focusEl){
				var oriOverflow = $tree.style.overflow;
				$tree.style.overflow = 'hidden';
				focusEl.style.width = '100%';
				focusEl.firstElementChild.addClass('focus');
				setTimeout(function(){
					$tree.style.overflow = oriOverflow;
				}, 1);
				setTimeout(function(){
					localStorage.removeItem('focusID');
				}, 4000);
			}
		}
		
		setTimeout(adaptBookmarkTooltips, 100);
		
		tree = null;
	});
	
	// Events for the tree
	$tree.addEventListener('scroll', function(){
		localStorage.scrollTop = $tree.scrollTop; // store scroll position at each scroll event
	});
	$tree.addEventListener('focus', function(e){
		var el = e.target;
		var tagName = el.tagName;
		var focusEl = $tree.querySelector('.focus');
		if (focusEl) focusEl.removeClass('focus');
		if (tagName == 'A' || tagName == 'SPAN'){
			var id = el.parentNode.id.replace('neat-tree-item-', '');
			localStorage.focusID = id;
		} else {
			localStorage.focusID = null;
		}
	}, true);
	var closeUnusedFolders = localStorage.closeUnusedFolders;
	$tree.addEventListener('click', function(e){
		if (e.button != 0) return;
		var el = e.target;
		var tagName = el.tagName;
		if (tagName != 'SPAN') return;
		if (e.shiftKey || e.ctrlKey) return;
		var parent = el.parentNode;
		parent.toggleClass('open');
		var expanded = parent.hasClass('open');
		parent.setAttribute('aria-expanded', expanded);
		var children = parent.querySelector('ul');
		if (!children){
			var id = parent.id.replace('neat-tree-item-', '');
			chrome.bookmarks.getChildren(id, function(children){
				var html = generateHTML(children, parseInt(parent.parentNode.dataset.level) + 1);
				var div = document.createElement('div');
				div.innerHTML = html;
				var ul = div.querySelector('ul');
				ul.inject(parent);
				div.destroy();
				setTimeout(adaptBookmarkTooltips, 100);
			});
		}
		if (closeUnusedFolders && expanded){
			var siblings = parent.getSiblings('li');
			for (var i = 0, l = siblings.length; i < l; i++){
				var li = siblings[i];
				if (li.hasClass('parent')){
					li.removeClass('open').setAttribute('aria-expanded', false);
				}
			}
		}
		var opens = $tree.querySelectorAll('li.open');
		opens = Array.map(function(li){
			return li.id.replace('neat-tree-item-', '');
		}, opens);
		localStorage.opens = JSON.stringify(opens);
	});
	// Force middle clicks to trigger the focus event
	$tree.addEventListener('mouseup', function(e){
		if (e.button != 1) return;
		var el = e.target;
		var tagName = el.tagName;
		if (tagName != 'A' && tagName != 'SPAN') return;
		el.focus();
	});
	
	// Search
	var $results = $('results');
	var searchMode = false;
	var searchInput = $('search-input');
	var prevValue = '';
	
	var search = function(){
		var value = searchInput.value.trim();
		localStorage.searchQuery = value;
		if (value == ''){
			prevValue = '';
			searchMode = false;
			$tree.style.display = 'block';
			$results.style.display = 'none';
			return;
		}
		if (value == prevValue) return;
		prevValue = value;
		searchMode = true;
		chrome.bookmarks.search(value, function(results){
			var v = value.toLowerCase();
			var vPattern = new RegExp('^' + value.escapeRegExp().replace(/\s+/g, '.*'), 'ig');
			if (results.length > 1){
				results.sort(function(a, b){
					var aTitle = a.title;
					var bTitle = b.title;
					var aIndexTitle = aTitle.toLowerCase().indexOf(v);
					var bIndexTitle = bTitle.toLowerCase().indexOf(v);
					if (aIndexTitle >= 0 || bIndexTitle >= 0){
						if (aIndexTitle < 0) aIndexTitle = Infinity;
						if (bIndexTitle < 0) bIndexTitle = Infinity;
						return aIndexTitle - bIndexTitle;
					}
					var aTestTitle = vPattern.test(aTitle);
					var bTestTitle = vPattern.test(bTitle);
					if (aTestTitle && !bTestTitle) return -1;
					if (!aTestTitle && bTestTitle) return 1;
					return b.dateAdded - a.dateAdded;
				});
				results = results.slice(0, 100); // 100 is enough
			}
			var html = '<ul role="list">';
			for (var i = 0, l = results.length; i < l; i++){
				var result = results[i];
				var id = result.id;
				html += '<li data-parentid="' + result.parentId + '" id="results-item-' + id + '" role="listitem">'
					+ generateBookmarkHTML(result.title, result.url);
			}
			html += '</ul>';
			$tree.style.display = 'none';
			$results.innerHTML = html;
			$results.style.display = 'block';
			
			var lis = $results.querySelectorAll('li');
			Array.forEach(function(li){
				var parentId = li.dataset.parentid;
				chrome.bookmarks.get(parentId, function(node){
					if (!node || !node.length) return;
					var a = li.querySelector('a');
					a.title = _m('parentFolder', node[0].title) + '\n' + a.title;
				});
			}, lis);
			
			results = null;
			vPattern = null;
			lis = null;
		});
	};
	searchInput.addEventListener('input', search);
	
	searchInput.addEventListener('keydown', function(e){
		var key = e.keyCode;
		var focusID = localStorage.focusID;
		if (key == 40 && searchInput.value.length == searchInput.selectionEnd){ // down
			e.preventDefault();
			if (searchMode){
				$results.querySelector('ul>li:first-child a').focus();
			} else {
				$tree.querySelector('ul>li:first-child').querySelector('span, a').focus();
			}
		} else if (key == 13 && searchInput.value.length){ // enter
			var item = $results.querySelector('ul>li:first-child a');
			item.focus();
			setTimeout(function(){
				var event = document.createEvent('MouseEvents');
				event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
				item.dispatchEvent(event);
			}, 30);
		} else if (key == 9 && !searchMode){ // tab
			if (typeof focusID != 'undefined' && focusID != null){
				var focusEl = $('neat-tree-item-' + focusID);
				if (focusEl){
					e.preventDefault();
					focusEl.firstElementChild.focus();
				}
			} else {
				var bound = $tree.scrollTop;
				var items = $tree.querySelectorAll('a, span');
				var firstItem = Array.filter(function(item){
					return !!item.parentElement.offsetHeight && ((item.offsetTop + item.offsetHeight) > bound);
				}, items)[0];
				if (firstItem) firstItem.focus();
			}
		// Pressing esc shouldn't close the popup when search field has value
		} else if (e.keyCode == 27 && searchInput.value){ // esc
			e.preventDefault();
			searchInput.value = '';
			search();
		}
	});
	
	searchInput.addEventListener('focus', function(){
		body.addClass('searchFocus');
	});
	searchInput.addEventListener('blur', function(){
		body.removeClass('searchFocus');
	});
	
	// Saved search query
	if (rememberState && localStorage.searchQuery){
		searchInput.value = localStorage.searchQuery;
		search();
		searchInput.select();
		searchInput.scrollLeft = 0;
	}
	
	// Popup auto-height
	var resetHeight = function(){
		var zoomLevel = localStorage.zoom ? localStorage.zoom.toInt() / 100 : 1;
		setTimeout(function(){
			var neatTree = $tree.firstElementChild;
			if (neatTree){
				var fullHeight = (neatTree.offsetHeight + $tree.offsetTop + 16) * zoomLevel;
				// Slide up faster than down
				body.style.webkitTransitionDuration = (fullHeight < window.innerHeight) ? '.3s' : '.1s';
				var maxHeight = screen.height - window.screenY - 50;
				var height = Math.max(200, Math.min(fullHeight, maxHeight));
				body.style.height = height + 'px';
				localStorage.popupHeight = height;
			}
		}, 100);
	};
	if (!searchMode) resetHeight();
	$tree.addEventListener('click', resetHeight);
	$tree.addEventListener('keyup', resetHeight);
	
	// Confirm dialog event listeners
	$('confirm-dialog-button-1').addEventListener('click', function(){
		ConfirmDialog.fn1();
		ConfirmDialog.close();
	}, false);
	
	$('confirm-dialog-button-2').addEventListener('click', function(){
		ConfirmDialog.fn2();
		ConfirmDialog.close();
	}, false);
	
	// Confirm dialog
	var ConfirmDialog = {
		open: function(opts){
			if (!opts) return;
			$('confirm-dialog-text').innerHTML = opts.dialog.widont();
			$('confirm-dialog-button-1').innerHTML = opts.button1;
			$('confirm-dialog-button-2').innerHTML = opts.button2;
			if (opts.fn1) ConfirmDialog.fn1 = opts.fn1;
			if (opts.fn2) ConfirmDialog.fn2 = opts.fn2;
			$('confirm-dialog-button-' + (opts.focusButton || 1)).focus();
			document.body.addClass('needConfirm');
		},
		close: function(){
			document.body.removeClass('needConfirm');
		},
		fn1: function(){},
		fn2: function(){}
	};
	
	// Edit dialog event listener
	$('edit-dialog').addEventListener('submit', function(){
		EditDialog.close();
		return false;
	}, false);

	// Edit dialog
	var EditDialog = window.EditDialog = {
		open: function(opts){
			if (!opts) return;
			$('edit-dialog-text').innerHTML = opts.dialog.widont();
			if (opts.fn) EditDialog.fn = opts.fn;
			var type = opts.type || 'bookmark';
			var name = $('edit-dialog-name');
			name.value = opts.name;
			name.focus();
			name.select();
			name.scrollLeft = 0; // very delicate, show first few words instead of last
			var url = $('edit-dialog-url');
			if (type == 'bookmark'){
				url.style.display = '';
				url.disabled = false;
				url.value = opts.url;
			} else {
				url.style.display = 'none';
				url.disabled = true;
				url.value = '';
			}
			body.addClass('needEdit');
		},
		close: function(){
			var urlInput = $('edit-dialog-url');
			var url = urlInput.value;
			if (!urlInput.validity.valid){
				urlInput.value = 'http://' + url;
				if (!urlInput.validity.valid) url = ''; // if still invalid, forget it.
				url = 'http://' + url;
			}
			EditDialog.fn($('edit-dialog-name').value, url);
			body.removeClass('needEdit');
		},
		fn: function(){}
	};
	
	// Bookmark handling
	var dontConfirmOpenFolder = !!localStorage.dontConfirmOpenFolder;
	var bookmarkClickStayOpen = !!localStorage.bookmarkClickStayOpen;
	var openBookmarksLimit = 10;
	var actions = {
		openBookmark: function(url){
			chrome.tabs.getSelected(null, function(tab){
				try {
                    decodedURL = decodeURIComponent(url);
                } catch (e) {
                    return;
                }
				chrome.tabs.update(tab.id, {
					url: decodedURL
				});
				if (!bookmarkClickStayOpen) setTimeout(window.close, 200);
			});
		},
		
		openBookmarkNewTab: function(url, selected, blankTabCheck){
			var open = function(){
				chrome.tabs.create({
					url: url,
					selected: selected
				});
			};
			if (blankTabCheck){
				chrome.tabs.getSelected(null, function(tab){
					if (/^chrome:\/\/newtab/i.test(tab.url)){
						chrome.tabs.update(tab.id, {
							url: url
						});
						if (!bookmarkClickStayOpen) setTimeout(window.close, 200);
					} else {
						open();
					}
				});
			} else {
				open();
			}
		},
		
		openBookmarkNewWindow: function(url, incognito){
			chrome.windows.create({
				url: url,
				incognito: incognito
			});
		},
		
		openBookmarks: function(urls, selected){
			var urlsLen = urls.length;
			var open = function(){
				chrome.tabs.create({
					url: urls.shift(),
					selected: selected // first tab will be selected
				});
				for (var i = 0, l = urls.length; i < l; i++){
					chrome.tabs.create({
						url: urls[i],
						selected: false
					});
				}
			};
			if (!dontConfirmOpenFolder && urlsLen > openBookmarksLimit){
				ConfirmDialog.open({
					dialog: _m('confirmOpenBookmarks', ''+urlsLen),
					button1: '<strong>' + _m('open') + '</strong>',
					button2: _m('nope'),
					fn1: open
				});
			} else {
				open();
			}
		},
		
		openBookmarksNewWindow: function(urls, incognito){
			var urlsLen = urls.length;
			var open = function(){
				chrome.windows.create({
					url: urls,
					incognito: incognito
				});
			};
			if (!dontConfirmOpenFolder && urlsLen > openBookmarksLimit){
				var dialog = incognito ? _m('confirmOpenBookmarksNewIncognitoWindow', ''+urlsLen) : _m('confirmOpenBookmarksNewWindow', ''+urlsLen);
				ConfirmDialog.open({
					dialog: dialog,
					button1: '<strong>' + _m('open') + '</strong>',
					button2: _m('nope'),
					fn1: open
				});
			} else {
				open();
			}
		},
		
		editBookmarkFolder: function(id){
			chrome.bookmarks.get(id, function(nodeList){
				if (!nodeList.length) return;
				var node = nodeList[0];
				var url = node.url;
				var isBookmark = !!url;
				var type = isBookmark ? 'bookmark' : 'folder';
				var dialog = isBookmark ? _m('editBookmark') : _m('editFolder');
				EditDialog.open({
					dialog: dialog,
					type: type,
					name: node.title,
					url: decodeURIComponent(url),
					fn: function(name, url){
						chrome.bookmarks.update(id, {
							title: name,
							url: isBookmark ? url : ''
						}, function(n){
							var title = n.title;
							var url = n.url;
							var li = $('neat-tree-item-' + id);
							if (li){
								if (isBookmark){
									var css = li.querySelector('a').style.cssText;
									li.innerHTML = generateBookmarkHTML(title, url, 'style="' + css + '"');
								} else {
									var i = li.querySelector('i');
									var name = title || (httpsPattern.test(url) ? url.replace(httpsPattern, '') : _m('noTitle'));
									i.textContent = name;
								}
							}
							if (searchMode){
								li = $('results-item-' + id);
								li.innerHTML = generateBookmarkHTML(title, url);
							}
							li.firstElementChild.focus();
						});
					}
				});
			});
		},
		
		deleteBookmark: function(id){
			var li1 = $('neat-tree-item-' + id);
			var li2 = $('results-item-' + id);
			chrome.bookmarks.remove(id, function(){
				if (li1){
					var nearLi1 = li1.nextElementSibling || li1.previousElementSibling;
					li1.destroy();
					if (!searchMode && nearLi1) nearLi1.querySelector('a, span').focus();
				}
				if (li2){
					var nearLi2 = li2.nextElementSibling || li2.previousElementSibling;
					li2.destroy();
					if (searchMode && nearLi2) nearLi2.querySelector('a, span').focus();
				}
			});
		},
		
		deleteBookmarks: function(id, bookmarkCount, folderCount){
			var li = $('neat-tree-item-' + id);
			var item = li.querySelector('span');
			if (bookmarkCount || folderCount){
				var dialog = '';
				var folderName = '<cite>' + item.textContent.trim() + '</cite>';
				if (bookmarkCount && folderCount){
					dialog = _m('confirmDeleteFolderSubfoldersBookmarks', [folderName, folderCount, bookmarkCount]);
				} else if (bookmarkCount){
					dialog = _m('confirmDeleteFolderBookmarks', [folderName, bookmarkCount]);
				} else {
					dialog = _m('confirmDeleteFolderSubfolders', [folderName, folderCount]);
				}
				ConfirmDialog.open({
					dialog: dialog,
					button1: '<strong>' + _m('delete') + '</strong>',
					button2: _m('nope'),
					fn1: function(){
						chrome.bookmarks.removeTree(id, function(){
							li.destroy();
						});
						var nearLi = li.nextElementSibling || li.previousElementSibling;
						if (nearLi) nearLi.querySelector('a, span').focus();
					},
					fn2: function(){
						li.querySelector('a, span').focus();
					}
				});
			} else {
				chrome.bookmarks.removeTree(id, function(){
					li.destroy();
				});
				var nearLi = li.nextElementSibling || li.previousElementSibling;
				if (nearLi) nearLi.querySelector('a, span').focus();
			}
		}
	};
	
	var middleClickBgTab = !!localStorage.middleClickBgTab;
	var leftClickNewTab = !!localStorage.leftClickNewTab;
	var noOpenBookmark = false;
	var bookmarkHandler = function(e){
		e.preventDefault();
		if (e.button != 0) return; // force left-click
		if (noOpenBookmark){ // flag that disables opening bookmark
			noOpenBookmark = false;
			return;
		}
		var el = e.target;
		var ctrlMeta = (e.ctrlKey || e.metaKey);
		var shift = e.shiftKey;
		if (el.tagName == 'A'){
			var url = el.href;
			if (ctrlMeta){ // ctrl/meta click
				actions.openBookmarkNewTab(url, middleClickBgTab ? shift : !shift);
			} else { // click
				if (shift){
					actions.openBookmarkNewWindow(url);
				} else {
					leftClickNewTab ? actions.openBookmarkNewTab(url, true, true) : actions.openBookmark(url);
				}
			}
		} else if (el.tagName == 'SPAN'){
			var li = el.parentNode;
			var id = li.id.replace('neat-tree-item-', '');
			chrome.bookmarks.getChildren(id, function(children){
				var urls = Array.map(function(c){
					return c.url;
				}, children).clean();
				var urlsLen = urls.length;
				if (!urlsLen) return;
				if (ctrlMeta){ // ctrl/meta click
					actions.openBookmarks(urls, middleClickBgTab ? shift : !shift);
				} else if (shift){ // shift click
					actions.openBookmarksNewWindow(urls);
				}
			});
		}
	};
	$tree.addEventListener('click', bookmarkHandler);
	$results.addEventListener('click', bookmarkHandler);
	var bookmarkHandlerMiddle = function(e){
		if (e.button != 1) return; // force middle-click
		var event = document.createEvent('MouseEvents');
		event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, true, false, e.shiftKey, true, 0, null);
		e.target.dispatchEvent(event);
	};
	$tree.addEventListener('mouseup', bookmarkHandlerMiddle);
	$results.addEventListener('mouseup', bookmarkHandlerMiddle);
	
	// Disable Chrome auto-scroll feature
	window.addEventListener('mousedown', function(e){
		if (e.button == 1) e.preventDefault();
	});
	
	// Context menu
	var $bookmarkContextMenu = $('bookmark-context-menu');
	var $folderContextMenu = $('folder-context-menu');
	
	var clearMenu = function(e){
		currentContext = null;
		var active = body.querySelector('.active');
		if (active){
			active.removeClass('active');
			// This is kinda hacky. Oh well.
			if (e){
				var el = e.target;
				if (el == $tree || el == $results) active.focus();
			}
		}
		$bookmarkContextMenu.style.left = '-999px';
		$bookmarkContextMenu.style.opacity = 0;
		$folderContextMenu.style.left = '-999px';
		$folderContextMenu.style.opacity = 0;
	};
	
	body.addEventListener('click', clearMenu);
	$tree.addEventListener('scroll', clearMenu);
	$results.addEventListener('scroll', clearMenu);
	$tree.addEventListener('focus', clearMenu, true);
	$results.addEventListener('focus', clearMenu, true);
	
	var currentContext = null;
	var macCloseContextMenu = false;
	body.addEventListener('contextmenu', function(e){
		e.preventDefault();
		clearMenu();
		if (os == 'mac'){
			macCloseContextMenu = false;
			setTimeout(function(){ macCloseContextMenu = true; }, 500);
		}
		var el = e.target;
		if (el.tagName == 'A'){
			currentContext = el;
			var active = body.querySelector('.active');
			if (active) active.removeClass('active');
			el.addClass('active');
			var bookmarkMenuWidth = $bookmarkContextMenu.offsetWidth;
			var bookmarkMenuHeight = $bookmarkContextMenu.offsetHeight;
			var pageX = rtl ? Math.max(0, el.getBoundingClientRect().right - bookmarkMenuWidth) : Math.min(el.getBoundingClientRect().right, body.offsetWidth - bookmarkMenuWidth-16);
			var pageY = e.pageY;
			// var pageX = rtl ? Math.max(0, el.position().left - bookmarkMenuWidth) : Math.min(el.position().left, body.offsetWidth - bookmarkMenuWidth-16);
			// var pageX = body.offsetWidth - bookmarkMenuWidth-16;
			// var pageY = el.getBoundingClientRect().top;
			var boundY = window.innerHeight - bookmarkMenuHeight;
			if (pageY > boundY) pageY -= bookmarkMenuHeight;
			if (pageY < 0) pageY = boundY;
			pageY = Math.max(0, pageY);
			$bookmarkContextMenu.style.left = pageX + 'px';
			$bookmarkContextMenu.style.top = pageY + 'px';
			$bookmarkContextMenu.style.opacity = 1;
			$bookmarkContextMenu.focus();
		} else if (el.tagName == 'SPAN'){
			currentContext = el;
			var active = body.querySelector('.active');
			if (active) active.removeClass('active');
			el.addClass('active');
			if (el.parentNode.dataset.parentid == '0'){
				$folderContextMenu.addClass('hide-editables');
			} else {
				$folderContextMenu.removeClass('hide-editables');
			}
			var folderMenuWidth = $folderContextMenu.offsetWidth;
			var folderMenuHeight = $folderContextMenu.offsetHeight;
			// var pageX = rtl ? Math.max(0, e.pageX - folderMenuWidth) : Math.min(e.pageX, body.offsetWidth - folderMenuWidth);
			var pageX = rtl ? Math.max(0, el.getBoundingClientRect().right - folderMenuWidth) : Math.min(el.getBoundingClientRect().right, body.offsetWidth - folderMenuWidth-16);
			var pageY = e.pageY;
			var boundY = window.innerHeight - folderMenuHeight;
			if (pageY > boundY) pageY -= folderMenuHeight;
			if (pageY < 0) pageY = boundY;
			$folderContextMenu.style.left = pageX + 'px';
			$folderContextMenu.style.top = pageY + 'px';
			$folderContextMenu.style.opacity = 1;
			$folderContextMenu.focus();
		}
	});
	// on Mac, holding down right-click for a period of time closes the context menu
	// Not a complete implementation, but it works :)
	if (os == 'mac') body.addEventListener('mouseup', function(e){
		if (e.button == 2 && macCloseContextMenu){
			macCloseContextMenu = false;
			clearMenu();
		}
	});
	
	var bookmarkContextHandler = function(e){
		e.stopPropagation();
		if (!currentContext) return;
		var el = e.target;
		if (el.tagName != 'COMMAND') return;
		var url = currentContext.href;
		switch (el.id){
			case 'bookmark-new-tab':
				actions.openBookmarkNewTab(url);
				break;
			case 'bookmark-new-window':
				actions.openBookmarkNewWindow(url);
				break;
			case 'bookmark-new-incognito-window':
				actions.openBookmarkNewWindow(url, true);
				break;
			case 'bookmark-edit':
				var li = currentContext.parentNode;
				var id = li.id.replace(/(neat\-tree|results)\-item\-/, '');
				actions.editBookmarkFolder(id);
				break;
			case 'bookmark-delete':
				var li = currentContext.parentNode;
				var id = li.id.replace(/(neat\-tree|results)\-item\-/, '');
				actions.deleteBookmark(id);
				break;
		}
		clearMenu();
	};
	// On Mac, all three mouse clicks work; on Windows, middle-click doesn't work
	$bookmarkContextMenu.addEventListener('mouseup', function(e){
		e.stopPropagation();
		if (e.button == 0 || (os == 'mac' && e.button == 1)) bookmarkContextHandler(e);
	});
	$bookmarkContextMenu.addEventListener('contextmenu', bookmarkContextHandler);
	$bookmarkContextMenu.addEventListener('click', function(e){
		e.stopPropagation();
	});
	
	var folderContextHandler = function(e){
		if (!currentContext) return;
		var el = e.target;
		if (el.tagName != 'COMMAND') return;
		var li = currentContext.parentNode;
		var id = li.id.replace('neat-tree-item-', '');
		chrome.bookmarks.getChildren(id, function(children){
			var urls = Array.map(function(c){
				return c.url;
			}, children).clean();
			var urlsLen = urls.length;
			var noURLS = !urlsLen;
			switch (el.id){
				case 'folder-window':
					if (noURLS) return;
					actions.openBookmarks(urls);
					break;
				case 'folder-new-window':
					if (noURLS) return;
					actions.openBookmarksNewWindow(urls);
					break;
				case 'folder-new-incognito-window':
					if (noURLS) return;
					actions.openBookmarksNewWindow(urls, true);
					break;
				case 'folder-edit':
					actions.editBookmarkFolder(id);
					break;
				case 'folder-delete':
					actions.deleteBookmarks(id, urlsLen, children.length-urlsLen);
					break;
			}
		});
		clearMenu();
	};
	$folderContextMenu.addEventListener('mouseup', function(e){
		e.stopPropagation();
		if (e.button == 0 || (os == 'mac' && e.button == 1)) folderContextHandler(e);
	});
	$folderContextMenu.addEventListener('contextmenu', folderContextHandler);
	$folderContextMenu.addEventListener('click', function(e){
		e.stopPropagation();
	});
	
	// Keyboard navigation
	var keyBuffer = '', keyBufferTimer;
	var treeKeyDown = function(e){
		var item = document.activeElement;
		if (!/^(a|span)$/i.test(item.tagName)) item = $tree.querySelector('.focus') || $tree.querySelector('li:first-child>span');
		var li = item.parentNode;
		var keyCode = e.keyCode;
		var metaKey = e.metaKey;
		if (keyCode == 40 && metaKey) keyCode = 35; // cmd + down (Mac)
		if (keyCode == 38 && metaKey) keyCode = 36; // cmd + up (Mac)
		switch (keyCode){
			case 40: // down
				e.preventDefault();
				var liChild = li.querySelector('ul>li:first-child');
				if (li.hasClass('open') && liChild){
					liChild.querySelector('a, span').focus();
				} else {
					var nextLi = li.nextElementSibling;
					if (nextLi){
						nextLi.querySelector('a, span').focus();
					} else {
						do {
							li = li.parentNode.parentNode;
							if (li) nextLi = li.nextElementSibling;
							if (nextLi) LastLi = nextLi.querySelector('a, span');
							if (LastLi) LastLi.focus(); // down on the last item in tree
						} while (li && !nextLi);
					}
				}
				break;
			case 38: // up
				e.preventDefault();
				var prevLi = li.previousElementSibling;
				if (prevLi){
					while (prevLi.hasClass('open') && prevLi.querySelector('ul>li:last-child')){
						var lis = prevLi.querySelectorAll('ul>li:last-child');
						prevLi = Array.filter(function(li){
							return !!li.parentNode.offsetHeight;
						}, lis).getLast();
					};
					prevLi.querySelector('a, span').focus();
				} else {
					var parentPrevLi = li.parentNode.parentNode;
					if (parentPrevLi && parentPrevLi.tagName == 'LI'){
						parentPrevLi.querySelector('a, span').focus();
					} else {
						searchInput.focus();
					}
				}
				break;
			case 39: // right (left for RTL)
				e.preventDefault();
				if (li.hasClass('parent') && ((!rtl && !li.hasClass('open')) || (rtl && li.hasClass('open')))){
					var event = document.createEvent('MouseEvents');
					event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
					li.firstElementChild.dispatchEvent(event);
				} else if (rtl){
					var parentID = li.dataset.parentid;
					if (parentID == '0') return;
					$('neat-tree-item-' + parentID).querySelector('span').focus();
				}
				break;
			case 37: // left (right for RTL)
				e.preventDefault();
				if (li.hasClass('parent') && ((!rtl && li.hasClass('open')) || (rtl && !li.hasClass('open')))){
					var event = document.createEvent('MouseEvents');
					event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
					li.firstElementChild.dispatchEvent(event);
				} else if (!rtl){
					var parentID = li.dataset.parentid;
					if (parentID == '0') return;
					$('neat-tree-item-' + parentID).querySelector('span').focus();
				}
				break;
			case 32: // space
			case 13: // enter
				e.preventDefault();
				var event = document.createEvent('MouseEvents');
				event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, e.ctrlKey, false, e.shiftKey, e.metaKey, 0, null);
				li.firstElementChild.dispatchEvent(event);
				break;
			case 35: // end
				if (searchMode){
					this.querySelector('li:last-child a').focus();
				} else {
					var lis = this.querySelectorAll('ul>li:last-child');
					var li = Array.filter(function(li){
						return !!li.parentNode.offsetHeight;
					}, lis).getLast();
					li.querySelector('span, a').focus();
				}
				break;
			case 36: // home
				if (searchMode){
					this.querySelector('ul>li:first-child a').focus();
				} else {
					this.querySelector('ul>li:first-child').querySelector('span, a').focus();
				}
				break;
			case 34: // page down
				var self = this;
				var getLastItem = function(){
					var bound = self.offsetHeight + self.scrollTop;
					var items = self.querySelectorAll('a, span');
					return Array.filter(function(item){
						return !!item.parentElement.offsetHeight && item.offsetTop < bound;
					}, items).getLast();
				};
				var item = getLastItem();
				if (item != document.activeElement){
					e.preventDefault();
					item.focus();
				} else {
					setTimeout(function(){
						getLastItem().focus();
					}, 0);
				}
				break;
			case 33: // page up
				var self = this;
				var getFirstItem = function(){
					var bound = self.scrollTop;
					var items = self.querySelectorAll('a, span');
					return Array.filter(function(item){
						return !!item.parentElement.offsetHeight && ((item.offsetTop + item.offsetHeight) > bound);
					}, items)[0];
				};
				var item = getFirstItem();
				if (item != document.activeElement){
					e.preventDefault();
					item.focus();
				} else {
					setTimeout(function(){
						getFirstItem().focus();
					}, 0);
				}
				break;
			case 113: // F2, not for Mac
				if (os == 'mac') break;
				var id = li.id.replace(/(neat\-tree|results)\-item\-/, '');
				actions.editBookmarkFolder(id);
				break;
			case 46: // delete
				break; // don't run 'default'
			default:
				var key = String.fromCharCode(keyCode).trim();
				if (!key) return;
				if (key != keyBuffer) keyBuffer += key;
				clearTimeout(keyBufferTimer);
				keyBufferTimer = setTimeout(function(){ keyBuffer = ''; }, 500);
				var lis = this.querySelectorAll('ul>li');
				var items = [];
				for (var i = 0, l = lis.length; i < l; i++){
					var li = lis[i];
					if (li.parentNode.offsetHeight) items.push(li.firstElementChild);
				}
				var pattern = new RegExp('^' + keyBuffer.escapeRegExp(), 'i');
				var batch = [];
				var startFind = false;
				var found = false;
				var activeElement = document.activeElement;
				for (var i = 0, l = items.length; i < l; i++){
					var item = items[i];
					if (item == activeElement){
						startFind = true;
					} else if (startFind){
						if (pattern.test(item.textContent.trim())){
							found = true;
							item.focus();
							break;
						}
					} else {
						batch.push(item);
					}
				}
				if (!found){
					for (var i = 0, l = batch.length; i < l; i++){
						var item = batch[i];
						if (pattern.test(item.textContent.trim())){
							item.focus();
							break;
						}
					}
				}
		}
	};
	$tree.addEventListener('keydown', treeKeyDown);
	$results.addEventListener('keydown', treeKeyDown);
	
	var treeKeyUp = function(e){
		var item = document.activeElement;
		if (!/^(a|span)$/i.test(item.tagName)) item = $tree.querySelector('.focus') || $tree.querySelector('li:first-child>span');
		var li = item.parentNode;
		switch (e.keyCode){
			case 8: // backspace
				if (os != 'mac') break; // somehow delete button on mac gives backspace
			case 46: // delete
				e.preventDefault();
				var id = li.id.replace(/(neat\-tree|results)\-item\-/, '');
				if (li.hasClass('parent')){
					chrome.bookmarks.getChildren(id, function(children){
						var urlsLen = Array.map(function(c){
							return c.url;
						}, children).clean().length;
						actions.deleteBookmarks(id, urlsLen, children.length-urlsLen);
					});
				} else {
					actions.deleteBookmark(id);
				}
				break;
		}
	};
	$tree.addEventListener('keyup', treeKeyUp);
	$results.addEventListener('keyup', treeKeyUp);
	
	var contextKeyDown = function(e){
		var menu = this;
		var item = document.activeElement;
		var metaKey = e.metaKey;
		switch (e.keyCode){
			case 40: // down
				e.preventDefault();
				if (metaKey){ // cmd + down (Mac)
					menu.lastElementChild.focus();
				} else {
					if (item.tagName == 'COMMAND'){
						var nextItem = item.nextElementSibling;
						if (nextItem && nextItem.tagName == 'HR') nextItem = nextItem.nextElementSibling;
						if (nextItem){
							nextItem.focus();
						} else if (os != 'mac'){
							menu.firstElementChild.focus();
						}
					} else {
						item.firstElementChild.focus();
					}
				}
				break;
			case 38: // up
				e.preventDefault();
				if (metaKey){ // cmd + up (Mac)
					menu.firstElementChild.focus();
				} else {
					if (item.tagName == 'COMMAND'){
						var prevItem = item.previousElementSibling;
						if (prevItem && prevItem.tagName == 'HR') prevItem = prevItem.previousElementSibling;
						if (prevItem){
							prevItem.focus();
						} else if (os != 'mac'){
							menu.lastElementChild.focus();
						}
					} else {
						item.lastElementChild.focus();
					}
				}
				break;
			case 32: // space
				if (os != 'mac') break;
			case 13: // enter
				e.preventDefault();
				var event = document.createEvent('MouseEvents');
				event.initMouseEvent('mouseup', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
				item.dispatchEvent(event);
			case 27: // esc
				e.preventDefault();
				var active = body.querySelector('.active');
				if (active) active.removeClass('active').focus();
				clearMenu();
		}
	};
	$bookmarkContextMenu.addEventListener('keydown', contextKeyDown);
	$folderContextMenu.addEventListener('keydown', contextKeyDown);
	
	var contextMouseMove = function(e){
		e.target.focus();
	};
	$bookmarkContextMenu.addEventListener('mousemove', contextMouseMove);
	$folderContextMenu.addEventListener('mousemove', contextMouseMove);
	
	var contextMouseOut = function(){
		if (this.style.opacity.toInt()) this.focus();
	};
	$bookmarkContextMenu.addEventListener('mouseout', contextMouseOut);
	$folderContextMenu.addEventListener('mouseout', contextMouseOut);
	
	// Drag and drop
	var draggedBookmark = null;
	var draggedOut = false;
	var canDrop = false;
	var zoomLevel = 1;
	var bookmarkClone = $('bookmark-clone');
	var dropOverlay = $('drop-overlay');
	$tree.addEventListener('mousedown', function(e){
		if (e.button != 0) return;
		var el = e.target;
		var elParent = el.parentNode;
		// can move any bookmarks/folders except the default root folders
		if ((el.tagName == 'A' && elParent.hasClass('child')) || (el.tagName == 'SPAN' && elParent.hasClass('parent') && elParent.dataset.parentid != '0')){
			e.preventDefault();
			draggedOut = false;
			draggedBookmark = el;
			if (localStorage.zoom) zoomLevel = (localStorage.zoom.toInt() / 100);
			bookmarkClone.innerHTML = el.innerHTML;
			el.focus();
		}
	});
	var scrollTree, scrollTreeInterval = 100, scrollTreeSpot = 10;
	var stopScrollTree = function(){
		clearInterval(scrollTree);
		scrollTree = null;
	};
	document.addEventListener('mousemove', function(e){
		if (e.button != 0) return;
		if (!draggedBookmark) return;
		e.preventDefault();
		var el = e.target;
		var clientX = e.clientX;
		var clientY = e.clientY + document.body.scrollTop;
		if (el == draggedBookmark){
			bookmarkClone.style.left = '-999px';
			dropOverlay.style.left = '-999px';
			canDrop = false;
			return;
		}
		draggedOut = true;
		// if hovering over the dragged element itself or cursor move outside the tree
		var treeTop = $tree.offsetTop, treeBottom = window.innerHeight;
		if (clientX < 0 || clientY < treeTop || clientX > $tree.offsetWidth || clientY > treeBottom){
			bookmarkClone.style.left = '-999px';
			dropOverlay.style.left = '-999px';
			canDrop = false;
		}
		// if hovering over the top or bottom edges of the tree, scroll the tree
		var treeScrollHeight = $tree.scrollHeight, treeOffsetHeight = $tree.offsetHeight;
		if (treeScrollHeight > treeOffsetHeight){ // only scroll when it's scrollable
			var treeScrollTop = $tree.scrollTop;
			if (clientY <= treeTop + scrollTreeSpot){
				if (treeScrollTop == 0){
					stopScrollTree();
				} else if (!scrollTree) scrollTree = setInterval(function(){
					$tree.scrollByLines(-1);
					dropOverlay.style.left = '-999px';
				}, scrollTreeInterval);
			} else if (clientY >= treeBottom - scrollTreeSpot){
				if (treeScrollTop == (treeScrollHeight - treeOffsetHeight)){
					stopScrollTree();
				} else if (!scrollTree) scrollTree = setInterval(function(){
					$tree.scrollByLines(1);
					dropOverlay.style.left = '-999px';
				}, scrollTreeInterval);
			} else {
				stopScrollTree();
			}
		}
		// collapse the folder before moving it
		var draggedBookmarkParent = draggedBookmark.parentNode;
		if (draggedBookmark.tagName == 'SPAN' && draggedBookmarkParent.hasClass('open')){
			draggedBookmarkParent.removeClass('open').setAttribute('aria-expanded', false);
		}
		clientX /= zoomLevel;
		clientY /= zoomLevel;
		if (el.tagName == 'A'){
			canDrop = true;
			bookmarkClone.style.top = clientY + 'px';
			bookmarkClone.style.left = (rtl ? (clientX - bookmarkClone.offsetWidth) : clientX) + 'px';
			var elRect = el.getBoundingClientRect();
			var elRectTop = elRect.top + document.body.scrollTop;
			var elRectBottom = elRect.bottom + document.body.scrollTop;
			var top = (clientY >= elRectTop + elRect.height / 2) ? elRectBottom : elRectTop;
			dropOverlay.className = 'bookmark';
			dropOverlay.style.top = top + 'px';
			dropOverlay.style.left = rtl ? '0px' : el.style.webkitPaddingStart.toInt() + 16 + 'px';
			dropOverlay.style.width = (el.getComputedStyle('width').toInt() - 12) + 'px';
			dropOverlay.style.height = null;
		} else if (el.tagName == 'SPAN'){
			canDrop = true;
			bookmarkClone.style.top = clientY + 'px';
			bookmarkClone.style.left = clientX + 'px';
			var elRect = el.getBoundingClientRect();
			var top = null;
			var elRectTop = elRect.top + document.body.scrollTop;
			var elRectHeight = elRect.height;
			var elRectBottom = elRect.bottom + document.body.scrollTop;
			var elParent = el.parentNode;
			if (elParent.dataset.parentid != '0'){
				if (clientY < elRectTop + elRectHeight * .3){
					top = elRectTop;
				} else if (clientY > (elRectTop + elRectHeight * .7) && !elParent.hasClass('open')){
					top = elRectBottom;
				}
			}
			if (top == null){
				dropOverlay.className = 'folder';
				dropOverlay.style.top = elRectTop + 'px';
				dropOverlay.style.left = '0px';
				dropOverlay.style.width = elRect.width + 'px';
				dropOverlay.style.height = elRect.height + 'px';
			} else {
				dropOverlay.className = 'bookmark';
				dropOverlay.style.top = top + 'px';
				dropOverlay.style.left = el.style.webkitPaddingStart.toInt() + 16 + 'px';
				dropOverlay.style.width = (el.getComputedStyle('width').toInt() - 12) + 'px';
				dropOverlay.style.height = null;
			}
		}
	});
	var onDrop = function(){
		draggedBookmark = null;
		bookmarkClone.style.left = '-999px';
		dropOverlay.style.left = '-999px';
		canDrop = false;
	};
	document.addEventListener('mouseup', function(e){
		if (e.button != 0) return;
		if (!draggedBookmark) return;
		stopScrollTree();
		if (!canDrop){
			if (draggedOut) noOpenBookmark = true;
			draggedOut = false;
			onDrop();
			return;
		};
		var el = e.target;
		var elParent = el.parentNode;
		var id = elParent.id.replace('neat-tree-item-', '');
		if (!id){
			onDrop();
			return;
		}
		var draggedBookmarkParent = draggedBookmark.parentNode;
		var draggedID = draggedBookmarkParent.id.replace('neat-tree-item-', '');
		var clientY = (e.clientY + document.body.scrollTop) / zoomLevel;
		if (el.tagName == 'A'){
			var elRect = el.getBoundingClientRect();
			var elRectTop = elRect.top + document.body.scrollTop;
			var moveBottom = (clientY >= elRectTop + elRect.height / 2);
			chrome.bookmarks.get(id, function(node){
				if (!node || !node.length) return;
				node = node[0];
				var index = node.index;
				var parentId = node.parentId;
				if (draggedID){
					chrome.bookmarks.move(draggedID, {
						parentId: parentId,
						index: moveBottom ? ++index : index
					}, function(){
						draggedBookmarkParent.inject(elParent, moveBottom ? 'after' : 'before');
						draggedBookmark.style.webkitPaddingStart = el.style.webkitPaddingStart;
						draggedBookmark.focus();
						onDrop();
					});
				}
			});
		} else if (el.tagName == 'SPAN'){
			var elRect = el.getBoundingClientRect();
			var move = 0; // 0 = middle, 1 = top, 2 = bottom
			var elRectTop = elRect.top, elRectHeight = elRect.height;
			var elParent = el.parentNode;
			if (elParent.dataset.parentid != '0'){
				if (clientY < elRectTop + elRectHeight * .3){
					move = 1;
				} else if (clientY > elRectTop + elRectHeight * .7 && !elParent.hasClass('open')){
					move = 2;
				}
			}
			if (move > 0){
				var moveBottom = (move == 2);
				chrome.bookmarks.get(id, function(node){
					if (!node || !node.length) return;
					node = node[0];
					var index = node.index;
					var parentId = node.parentId;
					chrome.bookmarks.move(draggedID, {
						parentId: parentId,
						index: moveBottom ? ++index : index
					}, function(){
						draggedBookmarkParent.inject(elParent, moveBottom ? 'after' : 'before');
						draggedBookmark.style.webkitPaddingStart = el.style.webkitPaddingStart;
						draggedBookmark.focus();
						onDrop();
					});
				});
			} else {
				chrome.bookmarks.move(draggedID, {
					parentId: id
				}, function(){
					var ul = elParent.querySelector('ul');
					var level = parseInt(elParent.parentNode.dataset.level) + 1;
					draggedBookmark.style.webkitPaddingStart = (14 * level) + 'px';
					if (ul){
						draggedBookmarkParent.inject(ul);
					} else {
						draggedBookmarkParent.destroy();
					}
					el.focus();
					onDrop();
				});
			}
		} else {
			onDrop();
		}
	});
	
	// Resizer
	var $resizer = $('resizer');
	var resizerDown = false;
	var bodyWidth, screenX;
	$resizer.addEventListener('mousedown', function(e){
		e.preventDefault();
		e.stopPropagation();
		resizerDown = true;
		bodyWidth = body.offsetWidth;
		screenX = e.screenX;
	});
	document.addEventListener('mousemove', function(e){
		if (!resizerDown) return;
		e.preventDefault();
		var changedWidth = rtl ? (e.screenX - screenX) : (screenX - e.screenX);
		var width = bodyWidth + changedWidth;
		width = Math.min(640, Math.max(320, width));
		body.style.width = width + 'px';
		localStorage.popupWidth = width;
		clearMenu(); // messes the context menu
	});
	document.addEventListener('mouseup', function(e){
		if (!resizerDown) return;
		e.preventDefault();
		resizerDown = false;
		adaptBookmarkTooltips();
	});
	
	// Closing dialogs on escape
	var closeDialogs = function(){
			if (body.hasClass('needConfirm')) ConfirmDialog.fn2(); ConfirmDialog.close();
			if (body.hasClass('needEdit')) EditDialog.close();
			if (body.hasClass('needAlert')) AlertDialog.close();
	};
	document.addEventListener('keydown', function(e){
		if (e.keyCode == 27 && (body.hasClass('needConfirm') || body.hasClass('needEdit') || body.hasClass('needAlert'))){ // esc
			e.preventDefault();
			closeDialogs();
		} else if ((e.metaKey || e.ctrlKey) && e.keyCode == 70){ // cmd/ctrl + f
			searchInput.focus();
			searchInput.select();
		}
	});
	$('cover').addEventListener('click', closeDialogs);
	
	// Make webkit transitions work only after elements are settled down
	setTimeout(function(){
		body.addClass('transitional');
	}, 10);
	
	// Zoom
	if (localStorage.zoom){
		body.dataset.zoom = localStorage.zoom;
	}
	var zoom = function(val){
		if (draggedBookmark) return; // prevent zooming when drag-n-droppping
		var dataZoom = body.dataset.zoom;
		var currentZoom = dataZoom ? dataZoom.toInt() : 100;
		if (val == 0){
			delete body.dataset.zoom;
			localStorage.removeItem('zoom');
		} else {
			var z = (val>0) ? currentZoom + 10 : currentZoom - 10;
			z = Math.min(150, Math.max(90, z));
			body.dataset.zoom = z;
			localStorage.zoom = z;
		}
		body.addClass('dummy').removeClass('dummy'); // force redraw
		resetHeight();
	};
	document.addEventListener('mousewheel', function(e){
		if (!e.metaKey && !e.ctrlKey) return;
		e.preventDefault();
		zoom(e.wheelDelta);
	});
	document.addEventListener('keydown', function(e){
		if (!e.metaKey && !e.ctrlKey) return;
		switch (e.keyCode){
			case 187: // + (plus)
				e.preventDefault();
				zoom(1);
				break;
			case 189: // - (minus)
				e.preventDefault();
				zoom(-1);
				break;
			case 48: // 0 (zero)
				e.preventDefault();
				zoom(0);
				break;
		}
	});
	
	// Fix stupid Chrome build 536 bug
	if (version.build >= 536) body.addClass('chrome-536');
	
	// Fix stupid wrong offset of the page on Mac
	if (os == 'mac'){
		setTimeout(function(){
			var top = body.scrollTop;
			if (top != 0) body.scrollTop = 0;
		}, 1500);
	}
	
	if (localStorage.userstyle){
		var style = document.createElement('style');
		style.textContent = localStorage.userstyle;
		style.inject(document.body);
	}
})(window);

onerror = function(){
	chrome.extension.sendRequest({error: [].slice.call(arguments)})
};