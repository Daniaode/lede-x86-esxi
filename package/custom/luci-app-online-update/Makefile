#
# Copyright (C) 2026
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-online-update
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Daniaode

LUCI_TITLE:=LuCI online firmware update for LEDE x86-64
LUCI_DESCRIPTION:=Checks a fixed GitHub release repo, verifies SHA256, and \
 hands the image to sysupgrade after explicit confirmation.
LUCI_DEPENDS:=+luci-base +curl +ca-bundle +jsonfilter +rpcd +rpcd-mod-ucode +ucode
LUCI_PKGARCH:=all

define Package/luci-app-online-update/conffiles
/etc/config/online-update
endef

define Package/luci-app-online-update/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
}
exit 0
endef

# The baked version file lives under ./root/etc so that luci.mk's automatic
# ./root installation picks it up. A custom Package/.../install define would be
# overridden by luci.mk and the file would silently go missing.

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
