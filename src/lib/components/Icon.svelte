<script lang="ts">
    import {
        Bell,
        ChevronDown,
        ChevronRight,
        CreditCard,
        House,
        Menu,
        Search,
        Settings,
        ShoppingCart,
        Users,
        X,
        AlignLeft,
        AlignRight,
        Map,
        MapPin,
        Database,
    } from "lucide-svelte";

    let { name, size = "h-4 w-4", ...rest } = $props();

    // Get the icon component based on name
    function getIconComponent(iconName: string) {
        switch (iconName) {
            case "bell":
                return Bell;
            case "chevron-down":
                return ChevronDown;
            case "chevron-right":
                return ChevronRight;
            case "credit-card":
                return CreditCard;
            case "house":
                return House;
            case "menu":
                return Menu;
            case "search":
                return Search;
            case "settings":
                return Settings;
            case "shopping-cart":
                return ShoppingCart;
            case "users":
                return Users;
            case "x":
                return X;
            case "align-left":
                return AlignLeft;
            case "align-right":
                return AlignRight;
            case "map":
                return Map;
            case "waypoints":
                return MapPin;
            case "telemetry":
                return Database;
            default:
                return House;
        }
    }

    // Get the actual icon component
    let Icon = $derived(getIconComponent(name));
</script>

<Icon class={size} {...rest} />
