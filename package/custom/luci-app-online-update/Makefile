#
# Copyright (C) 2026
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-online-update
PKG_VERSION:=1.1.0
PKG_RELEASE:=2

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
# ./root installation picks it up. A custom Package/.../install define would
# be overridden by luci.mk and the file would silently go missing.

include $(TOPDIR)/feeds/luci/luci.mk

# Two build-time guards. luci.mk's Build/Compile is empty for packages without
# src/, so redefining it here only adds these checks.
#
#   check-manifest.sh - every file the package must install actually exists,
#     with executable bits set. Added after a `rm -rf root` silently dropped
#     the ACL, menu entry, init script, uci-defaults and status include: the
#     package still built and installed, just with 5 files instead of 10, and
#     an upgraded device masked it because the old files were already baked in.
#
#   check-verbs.sh - every verb the frontend calls is allowed by the rpcd
#     shim. Added after `start` drifted out of the allowlist and "Start
#     download" silently did nothing for several releases.
define Build/Compile
	$(CURDIR)/tests/check-manifest.sh
	$(CURDIR)/tests/check-verbs.sh
endef

# call BuildPackage - OpenWrt buildroot signature
