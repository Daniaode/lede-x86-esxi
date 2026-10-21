include $(TOPDIR)/rules.mk

PKG_NAME:=fakehttp
PKG_VERSION:=0.9.18
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/killadm/FakeHTTP.git
PKG_SOURCE_DATE:=2026-07-23
PKG_SOURCE_VERSION:=59977c07f07b62c4bf15293c21e40bc3f9730b00
PKG_MIRROR_HASH:=skip

PKG_MAINTAINER:=FakeHTTP LuCI feed
PKG_LICENSE:=GPL-3.0-or-later
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/package.mk

define Package/fakehttp
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Firewall
  TITLE:=Obfuscate TCP connections into HTTP with NFQUEUE
  URL:=https://github.com/killadm/FakeHTTP
  DEPENDS:=+ca-bundle +uclient-fetch +libpthread +libnetfilter-queue +libnfnetlink +libmnl +nftables +kmod-nfnetlink-queue +kmod-nft-queue
endef

define Package/fakehttp/description
FakeHTTP obfuscates TCP connections into HTTP-like traffic by handling
packets through Netfilter Queue.
endef

define Package/fakehttp/conffiles
/etc/config/fakehttp
endef

define Build/Compile
	$(MAKE) -C $(PKG_BUILD_DIR) \
		CC="$(TARGET_CC)" \
		STRIP="$(TARGET_CROSS)strip" \
		CFLAGS="$(TARGET_CFLAGS) $(TARGET_CPPFLAGS)" \
		LDFLAGS="$(TARGET_LDFLAGS)" \
		PREFIX="/usr" \
		VERSION="$(PKG_VERSION)"
endef

define Package/fakehttp/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/build/fakehttp $(1)/usr/bin/fakehttp
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/fakehttp $(1)/etc/config/fakehttp
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/fakehttp $(1)/etc/init.d/fakehttp
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/80-fakehttp-defaults $(1)/etc/uci-defaults/80-fakehttp-defaults
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/fakehttp-scheduled-restart $(1)/usr/libexec/fakehttp-scheduled-restart
	$(INSTALL_BIN) ./files/usr/libexec/fakehttp-logread $(1)/usr/libexec/fakehttp-logread
	$(INSTALL_BIN) ./files/usr/libexec/fakehttp-update $(1)/usr/libexec/fakehttp-update
	$(INSTALL_DIR) $(1)/usr/share/fakehttp
	$(INSTALL_DATA) ./files/usr/share/fakehttp/functions.sh $(1)/usr/share/fakehttp/functions.sh
endef

define Package/fakehttp/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/fakehttp enable >/dev/null 2>&1 || true
	/etc/init.d/fakehttp update_cron >/dev/null 2>&1 || true
}
exit 0
endef

define Package/fakehttp/prerm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/fakehttp stop_now >/dev/null 2>&1 || true
	/etc/init.d/fakehttp clear_cron >/dev/null 2>&1 || true
	/etc/init.d/fakehttp disable >/dev/null 2>&1 || true
}
exit 0
endef

define Package/fakehttp/postrm
#!/bin/sh
rm -rf /var/log/fakehttp /var/run/fakehttp 2>/dev/null || true
exit 0
endef

$(eval $(call BuildPackage,fakehttp))
